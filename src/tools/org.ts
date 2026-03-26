/**
 * Organization tools.
 */

import { z } from 'zod';
import type { BlacksmithClient } from '../client.js';

export const listOrgsSchema = z.object({});

export const getOrgStatusSchema = z.object({});

export const getOrgSettingsSchema = z.object({});

export const getActorsSchema = z.object({});

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

export async function getOrgSettings(client: BlacksmithClient) {
  const settings = await client.getOrgSettings();

  return {
    general: {
      primary_email: settings.primary_email,
      email_alert_threshold: settings.email_alert_threshold,
      max_timeout: settings.max_timeout,
      runner_region: settings.runner_region,
    },
    features: {
      docker_container_caching: settings.docker_container_caching,
      branch_protection: settings.branch_protection,
      log_ingestion: settings.log_ingestion,
      ssh: settings.ssh,
    },
    pr_comments: {
      github_comments: settings.github_comments,
      user_pr_comment_settings: settings.user_pr_comment_settings,
    },
    insight: 'Organization settings and feature flags. Use the Blacksmith dashboard to modify these.',
  };
}

export async function getActors(client: BlacksmithClient) {
  const data = await client.getActors();

  return {
    actors: data,
    insight: 'Users who have triggered workflow runs in this organization.',
  };
}
