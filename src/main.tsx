import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CoyoteFastBreak } from "./ui/CoyoteFastBreak";
import "./styles/game.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

// Optional QA parameters: ?seed=123 replays a fixed run, ?qa=1 exposes state.
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get("seed"));
const seed = Number.isFinite(seedParam) && params.has("seed") ? seedParam : undefined;
const qaHook = params.get("qa") === "1";

createRoot(root).render(
  <StrictMode>
    <CoyoteFastBreak seed={seed} qaHook={qaHook} />
  </StrictMode>,
);
