import { loadYamlConfig, mergeConfig } from "./configLoader.js";

type ProjectContext = {
  name: string;
  goal: string;
  priorities: string[];
  modules: Record<"frontend" | "rust" | "java" | "mobile", string>;
  contracts: string[];
  mandatoryPolicies: string[];
  verification: string[];
  policySources: string[];
};

const baseContext = loadYamlConfig<Partial<ProjectContext>>("base-context.yaml");
const projectOverrides = loadYamlConfig<Partial<ProjectContext>>("project.yaml");

export const projectContext = mergeConfig(baseContext, projectOverrides) as ProjectContext;
