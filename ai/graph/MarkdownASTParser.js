/**
 * MarkdownASTParser - Pure structural parser for Markdown documents
 * Extracts document elements (headings, links, tags, attachments, code blocks, bold keyterms, inline code, math, callouts)
 */

class MarkdownASTParser {
  /**
   * Parse Markdown text into structural components
   */
  parse(filePath, content = '') {
    const path = require('path');
    const noteName = path.basename(filePath, '.md');
    
    const rootEntity = {
      name: noteName,
      type: 'Note',
      note_path: filePath,
      properties: { name: noteName, path: filePath }
    };

    const links = [];
    const tags = [];
    const media = [];
    const attachments = [];
    const urls = [];
    const codeBlocks = [];
    const sections = [];
    const keyTerms = [];
    const inlineCodes = [];
    const callouts = [];
    const mathFormulas = [];
    const metadataEntities = [];
    const frontmatter = {};

    if (!content || typeof content !== 'string') {
      return { rootEntity, links, tags, media, attachments, urls, codeBlocks, sections, keyTerms, inlineCodes, callouts, mathFormulas, metadataEntities, frontmatter };
    }

    // 0. Frontmatter & Key-Value Header Metadata Parsing (Tags, Name, Location, Time)
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const fmText = fmMatch ? fmMatch[1] : '';
    const metaBlockText = (fmText ? fmText + '\n' : '') + content.slice(0, 1500);

    const kvRegex = /^(?:[ \t]*[-*]\s+)?([a-zA-Z0-9_\s]+):\s*(.*)$/gm;
    let kvMatch;
    while ((kvMatch = kvRegex.exec(metaBlockText)) !== null) {
      const key = kvMatch[1].trim().toLowerCase();
      const valStr = kvMatch[2].trim();

      if (!key || !valStr) continue;

      if (key === 'tags' || key === 'tag') {
        const tagList = valStr.split(/[,;\s]+/).map(t => t.replace(/^[#\s]+|[#\s]+$/g, '')).filter(Boolean);
        tagList.forEach(t => {
          tags.push({
            tagName: `#${t}`,
            name: t,
            spanStart: kvMatch.index,
            spanEnd: kvMatch.index + kvMatch[0].length
          });
        });
        frontmatter.tags = tagList;
      } else if (key === 'name' || key === 'names' || key === 'author' || key === 'attendees' || key === 'people') {
        const names = valStr.split(/[,;]+/).map(n => n.trim()).filter(n => n.length > 1);
        names.forEach(n => {
          metadataEntities.push({
            name: n,
            type: 'Person',
            relation: 'has_person'
          });
        });
        frontmatter.names = names;
      } else if (key === 'location' || key === 'venue' || key === 'place' || key === 'city') {
        const loc = valStr.trim();
        if (loc) {
          metadataEntities.push({
            name: loc,
            type: 'Location',
            relation: 'located_in'
          });
          frontmatter.location = loc;
        }
      } else if (key === 'time' || key === 'date' || key === 'datetime') {
        frontmatter.time = valStr;
      } else {
        frontmatter[key] = valStr;
      }
    }

    if (fmText) {
      const bulletRegex = /^\s*[-*]\s+([a-zA-Z0-9_-]+)\s*$/gm;
      let bMatch;
      while ((bMatch = bulletRegex.exec(fmText)) !== null) {
        const item = bMatch[1].trim();
        if (item && !['tags', 'name', 'time', 'location'].includes(item.toLowerCase())) {
          tags.push({
            tagName: `#${item}`,
            name: item,
            spanStart: bMatch.index,
            spanEnd: bMatch.index + bMatch[0].length
          });
        }
      }
    }

    if (Object.keys(frontmatter).length > 0) {
      rootEntity.properties.metadata = frontmatter;
    }

    // 1. Wikilinks: [[Target Note]] or [[Target Note|Display Alias]]
    const wikilinkRegex = /\[\[(.*?)\]\]/g;
    let match;
    while ((match = wikilinkRegex.exec(content)) !== null) {
      const rawTarget = match[1].trim();
      const targetName = rawTarget.includes('|') ? rawTarget.split('|')[0].trim() : rawTarget;
      if (targetName) {
        links.push({
          targetName,
          type: 'links_to',
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 2. Tags: #tag
    const tagRegex = /(?:^|\s)#([a-zA-Z_-]*[a-zA-Z][a-zA-Z0-9_-]*)/g;
    while ((match = tagRegex.exec(content)) !== null) {
      const tagName = match[1].trim();
      if (tagName) {
        tags.push({
          tagName: `#${tagName}`,
          name: tagName,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 3. Images: ![alt](path)
    const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
    while ((match = imageRegex.exec(content)) !== null) {
      const altText = match[1].trim() || 'Image';
      const imgPath = match[2].trim();
      if (imgPath && !imgPath.startsWith('http://') && !imgPath.startsWith('https://')) {
        const imgName = imgPath.split(/[\\/]/).pop();
        media.push({
          name: imgName,
          path: imgPath,
          alt: altText,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 4. Attachments & External URLs: [label](href)
    const linkRegex = /(?<![[!])\[(.*?)\]\((.*?)\)/g;
    while ((match = linkRegex.exec(content)) !== null) {
      const label = match[1].trim();
      const href = match[2].trim();
      if (href.startsWith('http://') || href.startsWith('https://')) {
        urls.push({
          label: label || href,
          url: href,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      } else if (href && !href.startsWith('#')) {
        const docName = href.split(/[\\/]/).pop();
        attachments.push({
          name: docName,
          path: href,
          label,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 5. Code Blocks: ```lang
    const codeBlockRegex = /```([a-zA-Z0-9_+-]+)/g;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const lang = match[1].trim().toLowerCase();
      if (lang && lang.length < 20) {
        codeBlocks.push({
          language: lang,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 6. Section Headings: # Heading (levels 1-6)
    const headingRegex = /^(#{1,6})\s+(.+)$/gm;
    const headingMatches = [];
    while ((match = headingRegex.exec(content)) !== null) {
      const level = match[1].length;
      const title = match[2].replace(/[*_~`]/g, '').trim();
      headingMatches.push({
        level,
        title,
        index: match.index
      });
    }

    for (let i = 0; i < headingMatches.length; i++) {
      const current = headingMatches[i];
      const nextIndex = i + 1 < headingMatches.length ? headingMatches[i + 1].index : content.length;
      const sectionText = content.slice(current.index, nextIndex);
      const wordCount = sectionText.split(/\s+/).filter(w => w.length > 0).length;

      if (current.title) {
        sections.push({
          title: current.title,
          level: current.level,
          wordCount,
          spanStart: current.index,
          spanEnd: nextIndex
        });
      }
    }

    // 7. Bold Keyterms: **Term** (emphasized key concepts)
    const boldRegex = /\*\*([^*]+)\*\*/g;
    while ((match = boldRegex.exec(content)) !== null) {
      const term = match[1].trim();
      if (term.length >= 3 && term.length <= 60 && !term.includes('\n')) {
        keyTerms.push({
          term,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 8. Inline Code: `term`
    const inlineCodeRegex = /(?<!`)`([^`\n]+)`(?!`)/g;
    while ((match = inlineCodeRegex.exec(content)) !== null) {
      const code = match[1].trim();
      if (code.length >= 2 && code.length <= 50 && !code.includes(' ')) {
        inlineCodes.push({
          code,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 9. Callout Blocks: > [!NOTE] Title
    const calloutRegex = /^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/gm;
    while ((match = calloutRegex.exec(content)) !== null) {
      callouts.push({
        type: match[1].toUpperCase(),
        title: match[2].trim() || match[1],
        spanStart: match.index,
        spanEnd: match.index + match[0].length
      });
    }

    // 10. Math Formulas: $formula$ or $$formula$$
    const mathRegex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+)\$/g;
    while ((match = mathRegex.exec(content)) !== null) {
      const formula = (match[1] || match[2] || '').trim();
      if (formula.length >= 2 && formula.length <= 100) {
        mathFormulas.push({
          formula,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    // 11. Tasks: - [ ] task, [ ] task, - [x] completed task
    const tasks = [];
    const taskRegex = /^\s*[-*+]?\s*\[([ xX])\]\s+(.+)$/gm;
    while ((match = taskRegex.exec(content)) !== null) {
      const completed = match[1].toLowerCase() === 'x';
      const taskText = match[2].replace(/[*_~`]/g, '').trim();
      if (taskText && taskText.length >= 2) {
        tasks.push({
          taskText,
          completed,
          spanStart: match.index,
          spanEnd: match.index + match[0].length
        });
      }
    }

    return {
      rootEntity,
      links,
      tags,
      media,
      attachments,
      urls,
      codeBlocks,
      sections,
      keyTerms,
      inlineCodes,
      callouts,
      mathFormulas,
      tasks,
      metadataEntities,
      frontmatter
    };
  }
}

module.exports = MarkdownASTParser;
