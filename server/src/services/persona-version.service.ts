import { PersonaConfig } from './persona.types';

export interface PersonaVersion {
  version: string;
  personaId: string;
  config: PersonaConfig;
  createdAt: Date;
  createdBy: string;
  changelog?: string;
  isMajor: boolean;
}

export interface VersionComparison {
  fromVersion: string;
  toVersion: string;
  changes: Array<{
    field: string;
    fromValue: any;
    toValue: any;
    type: 'added' | 'removed' | 'modified';
  }>;
  breakingChanges: boolean;
}

export class PersonaVersionService {
  private versions: Map<string, PersonaVersion[]> = new Map();

  createVersion(
    personaId: string,
    config: PersonaConfig,
    userId: string,
    changelog?: string,
    isMajor = false
  ): PersonaVersion {
    const existing = this.versions.get(personaId) || [];
    const lastVersion = existing[existing.length - 1];
    
    let newVersion: string;
    if (isMajor || !lastVersion) {
      newVersion = '1.0.0';
    } else {
      const parts = lastVersion.version.split('.').map(Number);
      newVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
    }

    const version: PersonaVersion = {
      version: newVersion,
      personaId,
      config: JSON.parse(JSON.stringify(config)),
      createdAt: new Date(),
      createdBy: userId,
      changelog,
      isMajor,
    };

    existing.push(version);
    this.versions.set(personaId, existing);

    return version;
  }

  getVersions(personaId: string): PersonaVersion[] {
    return this.versions.get(personaId) || [];
  }

  getVersion(personaId: string, version: string): PersonaVersion | undefined {
    const versions = this.versions.get(personaId) || [];
    return versions.find(v => v.version === version);
  }

  compareVersions(personaId: string, fromVersion: string, toVersion: string): VersionComparison | null {
    const versions = this.versions.get(personaId) || [];
    const from = versions.find(v => v.version === fromVersion);
    const to = versions.find(v => v.version === toVersion);

    if (!from || !to) return null;

    const changes = this.diffConfigs(from.config, to.config);
    const breakingChanges = changes.some(c => 
      c.type === 'removed' || (c.type === 'modified' && (c.field === 'identity.name' || c.field === 'behavior.enforceFirstPerson'))
    );

    return {
      fromVersion,
      toVersion,
      changes,
      breakingChanges,
    };
  }

  rollbackToVersion(personaId: string, version: string): PersonaVersion | null {
    const targetVersion = this.getVersion(personaId, version);
    if (!targetVersion) return null;

    const versions = this.versions.get(personaId) || [];
    const rollbackVersion: PersonaVersion = {
      ...targetVersion,
      version: this.generateRollbackVersion(versions),
      createdAt: new Date(),
      createdBy: 'system',
      changelog: `Rollback to version ${version}`,
      isMajor: false,
    };

    versions.push(rollbackVersion);
    this.versions.set(personaId, versions);

    return rollbackVersion;
  }

  private diffConfigs(from: PersonaConfig, to: PersonaConfig): VersionComparison['changes'] {
    const changes: VersionComparison['changes'] = [];

    // Compare top-level fields
    const allKeys = new Set([...Object.keys(from), ...Object.keys(to)]);
    
    for (const key of allKeys) {
      const fromValue = (from as any)[key];
      const toValue = (to as any)[key];

      if (!(key in from)) {
        changes.push({ field: key, fromValue: undefined, toValue, type: 'added' });
      } else if (!(key in to)) {
        changes.push({ field: key, fromValue, toValue: undefined, type: 'removed' });
      } else if (JSON.stringify(fromValue) !== JSON.stringify(toValue)) {
        changes.push({ field: key, fromValue, toValue, type: 'modified' });
      }
    }

    return changes;
  }

  private generateRollbackVersion(versions: PersonaVersion[]): string {
    if (versions.length === 0) return '1.0.0';
    const last = versions[versions.length - 1];
    const parts = last.version.split('.').map(Number);
    return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

export const personaVersionService = new PersonaVersionService();
