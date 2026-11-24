import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ANTRACIT",
    short_name: "ANTRACIT",
    description: "ИИ-чат для учёбы и работы",
    start_url: "/",
    display: "standalone",
    background_color: "#080B10",
    theme_color: "#080B10",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
