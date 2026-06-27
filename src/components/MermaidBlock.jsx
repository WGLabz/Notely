import { useEffect, useState } from "react";

let mermaidInitialized = false;

export function MermaidBlock({ code, index }) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${index}-${Math.random().toString(36).slice(2)}`;

    async function renderMermaid() {
      try {
        const mermaidModule = await import("mermaid");
        const mermaid = mermaidModule?.default;
        if (!mermaidInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
              primaryColor: "#f4f1ea",
              primaryBorderColor: "#2f5d62",
              primaryTextColor: "#172326",
              lineColor: "#506b70",
              secondaryColor: "#dce8e3",
              tertiaryColor: "#ffffff",
            },
          });
          mermaidInitialized = true;
        }
        const result = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(result.svg);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setSvg("");
          setError(err?.message || "Unable to render Mermaid diagram.");
        }
      }
    }

    renderMermaid();

    return () => {
      cancelled = true;
    };
  }, [code, index]);

  if (error) {
    return <pre className="diagram-error">{error}</pre>;
  }

  return <div className="mermaid-render" dangerouslySetInnerHTML={{ __html: svg }} />;
}
