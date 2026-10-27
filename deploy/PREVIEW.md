# Task previews

Completed Ready tasks in Cezar expose **Build preview**. Factory builds the
selected committed task in an isolated checkout, installs its locked npm
dependencies, and starts Next.js on an allocated preview port. The committed
adapter is snapshotted from this project independently, including for older tasks.

Use **Build preview**, wait for the healthy application, and inspect the changed
pages. Factory's **Cancel preview** discards its checkout and disposable data.
Merging remains a separate **Merge PR into main** action subject to GitHub checks.

The normal local port, source checkout and production deployment are unaffected.
Previews start with application defaults and empty disposable data, without
copying source dotenv files, database contents, payment, email or marketplace
credentials. Browsing and local forms can be reviewed; external transactions
need a separately configured test environment. Do not configure live credentials
inside a preview. For applications with an admin login, the generated password is
available only in Factory's ignored `config/local-previews/<id>/secrets.json`.
