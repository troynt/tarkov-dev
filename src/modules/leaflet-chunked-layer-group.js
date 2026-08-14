import L from "leaflet";

const insertionQueue = [];
const idleResolvers = [];
const maxLayersPerFrame = 200;
const frameBudgetMs = 16;
const minimumLayersToChunk = 100;

let frameScheduled = false;

function layerIntersectsBounds(layer, bounds) {
    if (typeof layer.getLatLng === "function") {
        return bounds.contains(layer.getLatLng());
    }
    if (typeof layer.getBounds === "function") {
        const layerBounds = layer.getBounds();
        return layerBounds.isValid() && bounds.intersects(layerBounds);
    }
    if (typeof layer.getLayers === "function") {
        return layer.getLayers().some((childLayer) => layerIntersectsBounds(childLayer, bounds));
    }
    return false;
}

function prioritizeVisibleLayers(layers, map) {
    const mapBounds = map.getBounds();
    if (!mapBounds.isValid()) {
        return layers;
    }

    const priorityBounds = mapBounds.pad(0.25);
    const visibleLayers = [];
    const offscreenLayers = [];
    for (const layer of layers) {
        const target = layerIntersectsBounds(layer, priorityBounds) ? visibleLayers : offscreenLayers;
        target.push(layer);
    }
    return visibleLayers.concat(offscreenLayers);
}

function resolveIdleWaiters() {
    if (insertionQueue.length > 0 || frameScheduled) {
        return;
    }
    for (const resolve of idleResolvers.splice(0)) {
        resolve();
    }
}

function scheduleFrame() {
    if (frameScheduled) {
        return;
    }
    frameScheduled = true;
    requestAnimationFrame(processFrame);
}

function processFrame() {
    frameScheduled = false;
    const startedAt = performance.now();
    let insertedLayers = 0;

    while (
        insertionQueue.length > 0 &&
        insertedLayers < maxLayersPerFrame &&
        performance.now() - startedAt < frameBudgetMs
    ) {
        const insertion = insertionQueue.shift();
        if (insertion.generation !== insertion.group._insertionGeneration || insertion.group._map !== insertion.map) {
            continue;
        }

        insertion.map.addLayer(insertion.layers[insertion.index]);
        insertion.index += 1;
        insertedLayers += 1;

        if (insertion.index < insertion.layers.length) {
            insertionQueue.push(insertion);
        }
    }

    if (insertionQueue.length > 0) {
        scheduleFrame();
    }
    resolveIdleWaiters();
}

const ChunkedLayerGroup = L.LayerGroup.extend({
    initialize(layers, options) {
        this._insertionGeneration = 0;
        L.LayerGroup.prototype.initialize.call(this, layers, options);
    },

    onAdd(map) {
        const layers = this.getLayers();
        if (layers.length < minimumLayersToChunk) {
            L.LayerGroup.prototype.onAdd.call(this, map);
            return;
        }

        this._insertionGeneration += 1;
        insertionQueue.push({
            generation: this._insertionGeneration,
            group: this,
            index: 0,
            layers: prioritizeVisibleLayers(layers, map),
            map,
        });
        scheduleFrame();
    },

    onRemove(map) {
        this._insertionGeneration += 1;
        L.LayerGroup.prototype.onRemove.call(this, map);
    },
});

export function chunkedLayerGroup(layers, options) {
    return new ChunkedLayerGroup(layers, options);
}

export function whenMarkerInsertionIdle() {
    if (insertionQueue.length === 0 && !frameScheduled) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        idleResolvers.push(resolve);
    });
}
