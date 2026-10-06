import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        video: resolve(__dirname, "video.html"),
        host: resolve(__dirname, "host.html"),
        projector: resolve(__dirname, "projector.html")
      }
    }
  }
});
