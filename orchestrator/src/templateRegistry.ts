import { loadYamlConfig, mergeConfig } from "./configLoader.js";

export type TemplateCategory = "auth" | "design" | "redis" | "realtime";
export type TemplateRole = "frontend" | "rust" | "java" | "mobile";

export type TemplateContextFlags = {
  webOnly: boolean;
  mobileRequested: boolean;
  serviceWide: boolean;
  hotPathRedis: boolean;
};

type CategoryTemplate = {
  notes: {
    default: string;
    variants?: Record<string, string>;
  };
  roleContracts: Partial<Record<TemplateRole, string[]>>;
  verifierChecks: string[];
};

type CategoryTemplateRegistry = Record<TemplateCategory, CategoryTemplate>;

const baseTemplates = loadYamlConfig<CategoryTemplateRegistry>("base-templates.yaml");
const projectTemplateOverrides = loadYamlConfig<Partial<CategoryTemplateRegistry>>("project-templates.yaml");

export const categoryTemplateRegistry = mergeConfig(baseTemplates, projectTemplateOverrides);

export function renderAppliedTemplatesYaml(
  categories: TemplateCategory[],
  flags: TemplateContextFlags,
): string {
  const lines: string[] = [
    "categories:",
    ...categories.map((category) => `  - ${category}`),
    "flags:",
    `  web_only: ${flags.webOnly}`,
    `  mobile_requested: ${flags.mobileRequested}`,
    `  service_wide: ${flags.serviceWide}`,
    `  hot_path_redis: ${flags.hotPathRedis}`,
    "templates:",
  ];

  for (const category of categories) {
    const template = categoryTemplateRegistry[category];
    lines.push(`  ${category}:`);
    lines.push(`    note: "${template.notes.default}"`);
    if (template.notes.variants && Object.keys(template.notes.variants).length > 0) {
      lines.push("    variants:");
      for (const [key, value] of Object.entries(template.notes.variants)) {
        lines.push(`      ${key}: "${value}"`);
      }
    }
    lines.push("    verifier_checks:");
    for (const check of template.verifierChecks) {
      lines.push(`      - "${check}"`);
    }
  }

  return lines.join("\n");
}
