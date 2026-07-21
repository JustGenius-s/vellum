const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const OPEN_LABEL_PREFIX = "vellum:open:";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

export type PreviewInteraction =
  | { kind: "workspace-link"; target: string }
  | { kind: "external-link"; href: string }
  | { kind: "image"; source: string }
  | { kind: "blocked-link"; href: string };

interface ResolvedInteraction {
  action: PreviewInteraction;
  element: Element;
}

export function resolvePreviewHref(rawHref: string): PreviewInteraction | null {
  const href = rawHref.trim();
  if (!href) return null;
  if (href.startsWith("#")) return { kind: "blocked-link", href };

  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(href)?.[1]?.toLowerCase();
  if (!protocol) return { kind: "workspace-link", target: href };

  const normalizedProtocol = `${protocol}:`;
  return EXTERNAL_PROTOCOLS.has(normalizedProtocol)
    ? { kind: "external-link", href }
    : { kind: "blocked-link", href };
}

export function resolvePreviewLabel(label: string): PreviewInteraction | null {
  if (!label.startsWith(OPEN_LABEL_PREFIX)) return null;
  const target = label.slice(OPEN_LABEL_PREFIX.length).trim();
  return target ? { kind: "workspace-link", target } : null;
}

function hrefAttribute(element: Element) {
  return element.getAttribute("href") ?? element.getAttributeNS(XLINK_NAMESPACE, "href");
}

function findInteraction(origin: Element, root: ShadowRoot): ResolvedInteraction | null {
  let image: ResolvedInteraction | null = null;

  for (let element: Element | null = origin; element && element !== root.host; element = element.parentElement) {
    if (element.localName === "a") {
      const href = hrefAttribute(element);
      const action = href ? resolvePreviewHref(href) : null;
      if (action) return { action, element };
    }

    const label = element.getAttribute("data-typst-label");
    const action = label ? resolvePreviewLabel(label) : null;
    if (action) return { action, element };

    if (!image && element.localName === "image") {
      const source = hrefAttribute(element);
      if (source) image = { action: { kind: "image", source }, element };
    }
  }

  return image;
}

function eventOrigin(event: Event, root: ShadowRoot) {
  return event
    .composedPath()
    .find((candidate): candidate is Element => candidate instanceof Element && root.contains(candidate));
}

function accessibleLabel(action: PreviewInteraction) {
  switch (action.kind) {
    case "workspace-link":
      return `Open document: ${action.target}`;
    case "external-link":
      return `Open link: ${action.href}`;
    case "image":
      return "Open image preview";
    case "blocked-link":
      return `Unsupported link: ${action.href}`;
  }
}

function prepareInteractiveElements(root: ShadowRoot) {
  root.querySelectorAll("a, [data-typst-label], image").forEach((element) => {
    const resolved = findInteraction(element, root);
    if (!resolved || resolved.element !== element) return;

    element.setAttribute("data-vellum-interactive", "");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    if (!element.hasAttribute("aria-label")) {
      element.setAttribute("aria-label", accessibleLabel(resolved.action));
    }
    if (resolved.action.kind === "image") element.setAttribute("role", "button");
    if (element.localName !== "a" && resolved.action.kind === "workspace-link") {
      element.setAttribute("role", "link");
    }
  });
}

export function bindPreviewInteractions(
  root: ShadowRoot,
  onInteraction: (interaction: PreviewInteraction) => void,
) {
  prepareInteractiveElements(root);

  const activate = (event: Event) => {
    const origin = eventOrigin(event, root);
    if (!origin) return;
    const resolved = findInteraction(origin, root);
    if (!resolved) return;

    event.preventDefault();
    event.stopPropagation();
    onInteraction(resolved.action);
  };

  const handleClick = (event: Event) => activate(event);
  const handleKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const origin = eventOrigin(event, root);
    if (!origin) return;
    const resolved = findInteraction(origin, root);
    if (!resolved) return;

    const activates = event.key === "Enter" || (event.key === " " && resolved.action.kind === "image");
    if (activates) activate(event);
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("keydown", handleKeyDown);
  return () => {
    root.removeEventListener("click", handleClick);
    root.removeEventListener("keydown", handleKeyDown);
  };
}
