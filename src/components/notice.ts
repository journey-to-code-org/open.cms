export class OpenCmsNotice extends HTMLElement {
  #timer?: ReturnType<typeof setTimeout>;

  show(message: string, error = false): void {
    clearTimeout(this.#timer);
    this.textContent = message;
    this.classList.toggle("error", error);
    this.setAttribute("role", error ? "alert" : "status");
    this.hidden = false;
    if (!error) this.#timer = setTimeout(() => { this.hidden = true; }, 6000);
  }
}

if (!customElements.get("open-cms-notice")) customElements.define("open-cms-notice", OpenCmsNotice);
