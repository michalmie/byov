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
need a separately configured test environment. For applications with an admin
login, the generated password is available only in Factory's ignored
`config/local-previews/<id>/secrets.json`.

Transactional emails stay off by default: without the opt-in the app has no
sending account and logs mail to the preview log instead. Tick **Send
transactional emails** on Build preview to deliver real mail through the
project's saved Settings account (`data/mail.json`). Factory copies that file
into the preview before preparing, the adapter validates it before installing,
and the running preview gets outbound network access for delivery. Discard
removes the copy with the rest of the disposable data. Enable only for trusted
task results; never type live credentials into a preview form when the saved
account already covers it.
