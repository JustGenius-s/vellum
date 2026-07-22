const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const OPEN_LABEL_PREFIX = "vellum:open:";
const XLINK_NAMESPACE = "http://www.w3.org/1999/xlink";

export type PreviewInteraction =
  | { kind: "workspace-link"; target: string }
  | { kind: "external-link"; href: string }
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
  for (let element: Element | null = origin; element && element !== root.host; element = element.parentElement) {
    if (element.localName === "a") {
      const href = hrefAttribute(element);
      const action = href ? resolvePreviewHref(href) : null;
      if (action) return { action, element };
    }

    const label = element.getAttribute("data-typst-label");
    const action = label ? resolvePreviewLabel(label) : null;
    if (action) return { action, element };

  }

  return null;
}

function findImageSource(origin: Element, root: ShadowRoot) {
  for (let element: Element | null = origin; element && element !== root.host; element = element.parentElement) {
    if (element.localName !== "image") continue;
    const source = hrefAttribute(element);
    if (source?.startsWith("data:image/")) return source;
  }
  return null;
}

function imageSourceForEvent(event: Event, root: ShadowRoot) {
  const origin = eventOrigin(event, root);
  const direct = origin ? findImageSource(origin, root) : null;
  if (direct || !(event instanceof MouseEvent)) return direct;

  for (const element of root.querySelectorAll("image")) {
    const bounds = element.getBoundingClientRect();
    const containsPoint =
      event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom;
    if (!containsPoint) continue;
    const source = hrefAttribute(element);
    if (source?.startsWith("data:image/")) return source;
  }
  return null;
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
    case "blocked-link":
      return `Unsupported link: ${action.href}`;
  }
}

function prepareInteractiveElements(root: ShadowRoot) {
  root.querySelectorAll("a, [data-typst-label]").forEach((element) => {
    const resolved = findInteraction(element, root);
    if (!resolved || resolved.element !== element) return;

    element.setAttribute("data-vellum-interactive", "");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    if (!element.hasAttribute("aria-label")) {
      element.setAttribute("aria-label", accessibleLabel(resolved.action));
    }
    if (element.localName !== "a" && resolved.action.kind === "workspace-link") {
      element.setAttribute("role", "link");
    }
  });

  root.querySelectorAll("image").forEach((element) => {
    const source = hrefAttribute(element);
    if (!source?.startsWith("data:image/")) return;
    element.setAttribute("data-vellum-image-context", "");
    if (!element.hasAttribute("tabindex")) element.setAttribute("tabindex", "0");
    if (!element.hasAttribute("aria-label")) {
      element.setAttribute("aria-label", "Document image. Open the context menu for actions.");
    }
    element.setAttribute("role", "img");
  });
}

export function bindPreviewInteractions(
  root: ShadowRoot,
  onInteraction: (interaction: PreviewInteraction) => void,
  onImageTargetChange: (source: string | null) => void,
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
  const handlePointerDown = (event: Event) => {
    if (!(event instanceof PointerEvent)) return;
    if (event.pointerType === "mouse" && event.button !== 2) return;
    const source = imageSourceForEvent(event, root);
    onImageTargetChange(source);
    if (!source && event.pointerType !== "mouse") event.stopPropagation();
  };
  const handleContextMenu = (event: Event) => {
    const source = imageSourceForEvent(event, root);
    onImageTargetChange(source);
    if (!source) event.stopPropagation();
  };
  const handleKeyDown = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const origin = eventOrigin(event, root);
    if (!origin) return;
    const resolved = findInteraction(origin, root);
    if (!resolved) return;

    if (event.key === "Enter") activate(event);
  };

  root.addEventListener("click", handleClick);
  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("contextmenu", handleContextMenu);
  root.addEventListener("keydown", handleKeyDown);
  return () => {
    root.removeEventListener("click", handleClick);
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("contextmenu", handleContextMenu);
    root.removeEventListener("keydown", handleKeyDown);
  };
}
