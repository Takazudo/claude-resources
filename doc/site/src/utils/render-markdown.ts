import { marked } from "marked";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const renderer = new marked.Renderer();
renderer.heading = ({ text, depth }) => {
  const slug = slugify(text);
  return `<h${depth} id="${slug}">${text}</h${depth}>\n`;
};

export function renderMarkdown(body: string | undefined): string {
  if (!body) return "";
  return marked.parse(body, { async: false, renderer }) as string;
}
