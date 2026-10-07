import type { Place } from "../domain";

export class OpenCmsPlaceList extends HTMLElement {
  #places: Place[] = [];
  #selectedId?: string;
  #root: ShadowRoot;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
  }

  set places(value: Place[]) { this.#places = value; this.#render(); }
  set selectedId(value: string | undefined) { this.#selectedId = value; this.#render(); }

  #render(): void {
    this.#root.innerHTML = `<style>
      :host{display:block}.list{list-style:none;margin:0;padding:0;display:grid;gap:10px}
      button{width:100%;text-align:left;padding:15px;border:1px solid var(--line,#d2d9ce);border-radius:9px;background:var(--surface-raised,#fffdf7);color:var(--ink,#203a31);cursor:pointer}
      button[aria-pressed="true"]{border-color:var(--leaf,#41694e);box-shadow:0 0 0 2px color-mix(in srgb,var(--leaf,#41694e) 25%,transparent)}
      .name,.description,.activity{display:block}.name{font-weight:800}.description,.activity{margin-top:5px;color:var(--muted,#58685d);font-size:13px;line-height:1.5}
      button:focus-visible{outline:3px solid var(--focus,#b85d13);outline-offset:3px}
    </style><ul class="list">${this.#places.map((place) => `<li><button type="button" aria-pressed="${place.id === this.#selectedId}" data-id="${this.#escape(place.id)}"><span class="name">${this.#escape(place.name)}</span><span class="description">${this.#escape(place.description)}</span><span class="activity">${this.#escape(place.activities.slice(0, 3).join(" / ") || "Discover this place")}</span></button></li>`).join("")}</ul>`;
    this.#root.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const place = this.#places.find((item) => item.id === button.dataset.id);
        if (place) this.dispatchEvent(new CustomEvent("place-select", { detail: { place }, bubbles: true, composed: true }));
      });
    });
  }

  #escape(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  }
}

if (!customElements.get("open-cms-place-list")) customElements.define("open-cms-place-list", OpenCmsPlaceList);
