import app from './server';
import { pollEvents } from './poller';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Indexer REST API running on port ${PORT}`);
  // Start polling Horizon in the background
  pollEvents();
});
