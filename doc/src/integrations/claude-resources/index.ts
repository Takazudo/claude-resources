import type { AstroIntegration } from "astro";
import path from "node:path";
import { generateClaudeResourcesDocs } from "./generate";

export interface ClaudeResourcesOptions {
  claudeDir: string;
  projectRoot?: string;
}

export function claudeResourcesIntegration(
  options: ClaudeResourcesOptions,
): AstroIntegration {
  return {
    name: "claude-resources",
    hooks: {
      "astro:config:setup": ({ logger }) => {
        const rootDir = path.resolve(".");
        const claudeDir = path.resolve(rootDir, options.claudeDir);
        const projectRoot = options.projectRoot
          ? path.resolve(rootDir, options.projectRoot)
          : rootDir;
        const docsDir = path.join(rootDir, "src/content/docs");

        logger.info(`Generating from ${claudeDir}`);

        const counts = generateClaudeResourcesDocs({
          claudeDir,
          projectRoot,
          docsDir,
        });

        logger.info(
          `Done: ${counts.claudemd} CLAUDE.md, ${counts.commands} commands, ${counts.skills} skills, ${counts.agents} agents`,
        );
      },
    },
  };
}
