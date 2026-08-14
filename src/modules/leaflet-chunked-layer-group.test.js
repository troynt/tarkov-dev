import { afterEach, beforeEach, expect, it } from "@rstest/core";
import L from "leaflet";

import { chunkedLayerGroup, whenMarkerInsertionIdle } from "./leaflet-chunked-layer-group.js";

let animationFrames;
let map;
let mapContainer;
let originalRequestAnimationFrame;

beforeEach(() => {
    animationFrames = [];
    originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (callback) => {
        animationFrames.push(callback);
        return animationFrames.length;
    };

    mapContainer = document.createElement("div");
    document.body.append(mapContainer);
    map = L.map(mapContainer).setView([0, 0], 1);
});

afterEach(() => {
    map.remove();
    mapContainer.remove();
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

it("inserts large layer groups across animation frames", async () => {
    const insertedLayers = [];
    const layers = Array.from({ length: 201 }, (_, index) => {
        const layer = new L.Layer();
        layer.onAdd = () => insertedLayers.push(index);
        layer.onRemove = () => {};
        return layer;
    });

    chunkedLayerGroup(layers).addTo(map);

    expect(insertedLayers).toHaveLength(0);
    animationFrames.shift()(performance.now());
    expect(insertedLayers.length).toBeGreaterThan(0);
    expect(insertedLayers.length).toBeLessThan(201);

    while (animationFrames.length > 0) {
        animationFrames.shift()(performance.now());
    }
    await whenMarkerInsertionIdle();

    expect(insertedLayers).toHaveLength(201);
});

it("inserts layers within the padded viewport first", () => {
    const insertedLayers = [];
    map.getBounds = () => L.latLngBounds([-1, -1], [1, 1]);
    const layers = Array.from({ length: 201 }, (_, index) => {
        const layer = new L.Layer();
        layer.getLatLng = () => (index >= 199 ? L.latLng(0, 0) : L.latLng(10, 10));
        layer.onAdd = () => insertedLayers.push(index);
        layer.onRemove = () => {};
        return layer;
    });

    chunkedLayerGroup(layers).addTo(map);
    animationFrames.shift()(performance.now());

    expect(insertedLayers.slice(0, 2)).toEqual([199, 200]);

    while (animationFrames.length > 0) {
        animationFrames.shift()(performance.now());
    }
});

it("cancels pending insertion when a layer group is removed", async () => {
    const insertedLayers = [];
    const layers = Array.from({ length: 300 }, (_, index) => {
        const layer = new L.Layer();
        layer.onAdd = () => insertedLayers.push(index);
        layer.onRemove = () => {};
        return layer;
    });
    const group = chunkedLayerGroup(layers).addTo(map);

    animationFrames.shift()(performance.now());
    const insertedBeforeRemoval = insertedLayers.length;
    group.removeFrom(map);

    while (animationFrames.length > 0) {
        animationFrames.shift()(performance.now());
    }
    await whenMarkerInsertionIdle();

    expect(insertedLayers).toHaveLength(insertedBeforeRemoval);
});
