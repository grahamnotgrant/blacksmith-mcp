/**
 * Organization tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const listOrgsSchema = z.object({});

export const getOrgStatusSchema = z.object({});

export async function listOrgs(client: BlacksmithClient) {
  const orgs = await client.listOrgs();
  return {
    organizations: orgs.map((org) => ({
      login: org.login,
      name: org.name,
      id: org.id,
    })),
    count: orgs.length,
    hint: 'Set BLACKSMITH_ORG environment variable to one of these org logins to use other tools.',
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
