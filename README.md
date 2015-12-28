# websockets-psql-node-chat

Currently deployed on `http://198.199.105.73:9000`.

- `/admin/populateDatabase` endpoint checks how many users are currently in the `users` table and if it is below 10,000,000, it creates random users to reach that user count.
- `/admin/populateBannedWords` endpoint performs the same task as above but for banned words and with 100 entries.
- `/admin/getUserCount` endpoint displays the current user count. This should be 10,000,000 in most cases.

In order to deploy on your own server, make sure that the database schema found under `db.sql` is imported, and both the `populateDatabase` and `populateBannedWords` endpoint have been called at least once.
