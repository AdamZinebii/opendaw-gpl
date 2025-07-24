import {UUID} from "@opendaw/lib-std"
import {readFileSync, writeFileSync} from "fs"
import {resolve} from "path"
import {defineConfig} from "vite"
import crossOriginIsolation from "vite-plugin-cross-origin-isolation"
import viteCompression from "vite-plugin-compression"
import {BuildInfo} from "./src/BuildInfo"

export default defineConfig(({/*mode, command*/}) => {
    const uuid = UUID.toString(UUID.generate())
    const env = process.env.NODE_ENV as BuildInfo["env"]
    const date = Date.now()
    return {
        resolve: {
            alias: {
                "@": resolve(__dirname, "./src")
            }
        },
        build: {
            target: "esnext",
            minify: true,
            sourcemap: true,
            rollupOptions: {
                output: {
                    format: "es",
                    entryFileNames: `[name].${uuid}.js`,
                    chunkFileNames: `[name].${uuid}.js`,
                    assetFileNames: `[name].${uuid}.[ext]`
                }
            }
        },
        esbuild: {
            target: "esnext"
        },
        clearScreen: false,
        server: {
            port: 8080,
            host: "localhost",
            https: {
                key: readFileSync("../localhost-key.pem"),
                cert: readFileSync("../localhost.pem")
            },
            headers: {
                "Cross-Origin-Opener-Policy": "same-origin",
                "Cross-Origin-Embedder-Policy": "require-corp"
            },
            fs: {
                // Allow serving files from the entire workspace
                allow: [".."]
            }
        },
        plugins: [
            crossOriginIsolation(),
            viteCompression({
                algorithm: "brotliCompress"
            }),
            {
                name: "generate-date-json",
                buildStart() {
                    const outputPath = resolve(__dirname, "public", "build-info.json")
                    writeFileSync(outputPath, JSON.stringify({date, uuid, env} satisfies BuildInfo, null, 2))
                    console.debug(`Build info written to: ${outputPath}`)
                }
            },
            {
                name: "spa",
                configureServer(server) {
                    server.middlewares.use((req, res, next) => {
                        const url: string | undefined = req.url
                        if (url !== undefined && url.indexOf(".") === -1 && !url.startsWith("/@vite/")) {
                            const indexPath = resolve(__dirname, "index.html")
                            res.end(readFileSync(indexPath))
                        } else {
                            next()
                        }
                    })
                }
            }
        ]
    }
})