import type { RegistryPluginInfo } from './host.js';

export interface InstalledPluginVersion {
  id: string;
  version?: string;
  external?: boolean;
}

export interface RegistryUpdate {
  id: string;
  name: string;
  registry: string;
  version: string;
  installedVersion: string;
}

export interface RegistryUpdatePlan {
  updates: RegistryUpdate[];
  ambiguous: string[];
}

export function planRegistryUpdates(
  items: RegistryPluginInfo[],
  installed: InstalledPluginVersion[]
): RegistryUpdatePlan {
  const installedVersions = new Map<string, string>();
  for (const plugin of installed) {
    if (!plugin.external) continue;
    installedVersions.set(plugin.id, plugin.version ?? '0.0.0');
  }

  const candidates = new Map<string, RegistryPluginInfo[]>();
  for (const item of items) {
    const current = installedVersions.get(item.id);
    if (current === undefined || current === item.version) continue;
    const group = candidates.get(item.id) ?? [];
    group.push(item);
    candidates.set(item.id, group);
  }

  const updates: RegistryUpdate[] = [];
  const ambiguous: string[] = [];

  for (const [id, group] of candidates) {
    let item = group[0]!;

    if (group.length > 1) {
      const source = group.find((candidate) => candidate.sourceRegistry)
        ?.sourceRegistry;
      const preferred = source
        ? group.filter((candidate) => candidate.registry === source)
        : [];
      if (preferred.length !== 1) {
        ambiguous.push(id);
        continue;
      }
      item = preferred[0]!;
    }

    updates.push({
      id,
      name: item.name,
      registry: item.registry,
      version: item.version,
      installedVersion: installedVersions.get(id) ?? '0.0.0',
    });
  }

  updates.sort((left, right) => left.name.localeCompare(right.name));
  ambiguous.sort();
  return { updates, ambiguous };
}
