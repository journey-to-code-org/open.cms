import type { Hike } from "../hikes";

type HikeEvent = "hike-preview" | "hike-analyze" | "hike-export";

export class OpenCmsHikeList extends HTMLElement {
  #hikes: Hike[] = [];
  #regionName = "the selected region";
  #root: ShadowRoot;

  constructor() { super(); this.#root = this.attachShadow({ mode: "open" }); }
  set hikes(value: Hike[]) { this.#hikes = value; this.#render(); }
  set regionName(value: string) { this.#regionName = value; this.#render(); }

  #render(): void {
    this.#root.innerHTML = `<style>
      :host{display:block}.list{list-style:none;margin:0;padding:0;display:grid;gap:12px}
      .card{padding:16px;border:1px solid var(--line,#d2d9ce);border-radius:10px;background:var(--surface-raised,#fffdf7);color:var(--ink,#203a31)}
      h2{margin:5px 0;font-size:18px}.kind{color:var(--leaf,#41694e);font-size:11px;font-weight:800;letter-spacing:.08em}.note,.source{color:var(--muted,#58685d);font-size:12px;line-height:1.55}
      .warning{color:#9b3a20;font-weight:700}.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      button{padding:8px 11px;border:1px solid var(--line,#d2d9ce);border-radius:6px;background:var(--surface,#fbf9f1);color:var(--ink,#203a31);font:inherit;cursor:pointer}
      button:focus-visible,a:focus-visible{outline:3px solid var(--focus,#b85d13);outline-offset:3px}
      a{color:var(--leaf,#41694e)}
    </style><ul class="list">${this.#hikes.map((hike, index) => {
      const points = hike.segments.reduce((sum, segment) => sum + segment.length, 0);
      const restricted = ["no", "private"].includes(hike.source.tags.access) || hike.source.tags.foot === "no";
      return `<li class="card"><span class="kind">${this.#escape(hike.source.kind.toUpperCase())}</span><h2>${this.#escape(hike.name)}</h2><p class="note">${hike.segments.length} ${this.#escape(this.#regionName)} segments / ${points.toLocaleString()} points. Elevation unknown.</p>${restricted ? '<p class="warning">Restricted access is tagged. This is not a recommendation to enter.</p>' : ""}<p class="source">${this.#escape(hike.source.kind)} / ${this.#escape(hike.source.attribution)}. Retrieved ${this.#escape(new Date(hike.source.retrievedAt).toLocaleString())}.</p><p class="source">Access: ${this.#escape(hike.source.tags.access || "unknown")} / Foot access: ${this.#escape(hike.source.tags.foot || "unknown")} / Surface: ${this.#escape(hike.source.tags.surface || "unknown")} / Difficulty tag: ${this.#escape(hike.source.tags.sac_scale || "unknown")}.</p>${hike.source.regionalOnly ? `<p class="note">Geometry is limited to ${this.#escape(this.#regionName)} and may show only part of a longer route. Distance totals cover this regional portion.</p>` : ""}<a href="${this.#escape(hike.source.url)}" target="_blank" rel="noopener noreferrer">View OpenStreetMap source</a><div class="actions"><button data-action="preview" data-index="${index}">Preview on map</button><button data-action="analyze" data-index="${index}">Analyze hike</button><button data-action="export" data-index="${index}">Export GPX</button></div></li>`;
    }).join("")}</ul>`;
    this.#root.querySelectorAll<HTMLButtonElement>("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const hike = this.#hikes[Number(button.dataset.index)];
        if (!hike) return;
        const events: Record<string, HikeEvent> = { preview: "hike-preview", analyze: "hike-analyze", export: "hike-export" };
        this.dispatchEvent(new CustomEvent(events[button.dataset.action!], { detail: { hike }, bubbles: true, composed: true }));
      });
    });
  }

  #escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  }
}

if (!customElements.get("open-cms-hike-list")) customElements.define("open-cms-hike-list", OpenCmsHikeList);
