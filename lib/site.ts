export function buildSiteTitle(pageTitle: string, siteName: string) {
  if (!pageTitle || pageTitle === siteName) {
    return siteName;
  }

  return `${pageTitle} | ${siteName}`;
}

export function summarizeDatabaseProfile(
  databaseRequired: boolean,
  databaseProfile: string,
) {
  if (!databaseRequired) {
    return "No database";
  }

  if (databaseProfile === "sqlite") {
    return "SQLite for local flow";
  }

  if (databaseProfile === "mysql") {
    return "MySQL ready";
  }

  return "Database enabled";
}
