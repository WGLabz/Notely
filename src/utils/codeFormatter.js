const PARSERS = {
  javascript: "babel",
  typescript: "babel-ts",
  html: "html",
  css: "css",
  json: "json",
  markdown: "markdown",
  js: "babel",
  ts: "babel-ts",
  jsx: "babel",
  tsx: "babel-ts",
};

export async function formatCode(code, language) {
  if (!code || !language) return code;
  
  const parser = PARSERS[language.toLowerCase()];
  if (!parser) {
    console.warn(`No formatter available for language: ${language}`);
    return code;
  }

  try {
    const prettier = await import("prettier/standalone");
    const plugins = [];
    
    if (["babel", "babel-ts", "json"].includes(parser)) {
      plugins.push(await import("prettier/plugins/babel"));
      plugins.push(await import("prettier/plugins/estree"));
    } else if (parser === "html") {
      plugins.push(await import("prettier/plugins/html"));
    } else if (parser === "css") {
      plugins.push(await import("prettier/plugins/postcss"));
    } else if (parser === "markdown") {
      plugins.push(await import("prettier/plugins/markdown"));
    }

    const formatted = await prettier.format(code, {
      parser,
      plugins,
      singleQuote: false,
      tabWidth: 2,
    });
    
    return formatted.replace(/\n$/, "");
  } catch (error) {
    console.error("Failed to format code:", error);
    return code;
  }
}
