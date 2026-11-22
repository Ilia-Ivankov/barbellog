import app from './app.js';
import ENV from './config/env.config.js';

const port = ENV.PORT || 3000;
app.listen(port, () => console.log(`Barbellog API running on port ${port}`));
