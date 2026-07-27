import { app } from './app.js';
import { env } from './config/env.js';

app.listen(env.API_PORT, () => console.log(`Flinkout API listening on port ${env.API_PORT}`));
