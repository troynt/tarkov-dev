import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSvgr } from "@rsbuild/plugin-svgr";
import { execSync } from "node:child_process";

const commitHash = execSync("git rev-parse --short HEAD").toString().trim();

export default defineConfig({
    plugins: [pluginReact(), pluginSvgr({ mixedImport: true })],
    server: {
        base: process.env.PUBLIC_URL,
    },
    source: {
        define: {
            "process.env.PUBLIC_URL": JSON.stringify(process.env.PUBLIC_URL ?? ""),
            "process.env.RSTEST": process.env.RSTEST,
            "__COMMIT_HASH__": JSON.stringify(commitHash),
        },
    },
    html: {
        template: "./public/index.html",
    },
    output: {
        distPath: {
            root: "build",
        },
    },
});
