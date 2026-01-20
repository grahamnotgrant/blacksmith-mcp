/**
 * Organization tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const listOrgsSchema = z.object({});

export const getOrgStatusSchema = z.object({});

export async function listOrgs(client: BlacksmithClient) {
  const response = await client.listOrgs();
  return {
    organizations: response.installations.map((org) => ({
      login: org.login,
      name: org.name,
      id: org.id,
    })),
    total_count: response.total_count,
    active_org: response.active_org_name,
    is_org_admin: response.is_org_admin,
    hint: response.installations.length > 0
      ? 'Set BLACKSMITH_ORG environment variable to one of these org logins to use other tools.'
      : 'No Blacksmith installations found. Install the Blacksmith GitHub App on your org first.',
  };
}

export async function getOrgStatus(client: BlacksmithClient) {
  const [isPersonal, hasOnboarded, region] = await Promise.all([
    client.isPersonalOrg(),
    client.hasOnboarded(),
    client.getRunnerRegion(),
  ]);

  return {
    isPersonalOrg: isPersonal,
    hasOnboarded,
    runnerRegion: region,
  };
}
