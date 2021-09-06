import 'dotenv/config';

import fastify from 'fastify';
import fastifyRateLimit from 'fastify-rate-limit';
import got from 'got';

const app = fastify();
app.register(fastifyRateLimit, {
	max: 3,
	timeWindow: '1 minute',
});

const liveUrl = `https://www.youtube.com/channel/${process.env.CHANNEL_ID}/live`;

let lastTimestampChecked = 0;
let lastStatus = '';
let timestampOffline: number | undefined;

// 15 minutes for me to go live if I ever go offline
const bufferSeconds = 15 * 60;

function createLastStatusMessage() {
	return `${lastStatus} (last checked: ${
		(Date.now() - lastTimestampChecked) / 1000
	} seconds ago)`;
}

async function updateStatus() {
	const response = await got.get(liveUrl);

	if (response.body.includes('"isLive":true')) {
		lastStatus = `User is live at ${liveUrl}`;
	} else {
		if (timestampOffline === undefined) {
			timestampOffline = Date.now();
		}

		const minutesElapsed = Date.now() - timestampOffline;
		const minutesRemaining = Math.ceil(bufferSeconds / 60 - minutesElapsed);

		if (minutesRemaining > 0) {
			lastStatus = `Leon is not live; the gift card will be revealed if he fails to go live in ${Math.ceil(
				bufferSeconds / 60 - minutesElapsed
			)} minute${minutesRemaining === 1 ? '' : 's'}.`;
		} else {
			lastStatus = `Leon has not been live for ${
				bufferSeconds / 60
			} minutes. Gift card code: ${process.env.GIFT_CARD_CODE}`;
		}
	}
}

// Limit URL checks to once every minute
app.get('/check', async (request, reply) => {
	// If a minute has elapsed, refresh the status
	if (
		lastTimestampChecked === undefined ||
		lastTimestampChecked - Date.now() >= 60 * 1000
	) {
		lastTimestampChecked = Date.now();
		await updateStatus();
	}

	reply.send(createLastStatusMessage());
});

const port = process.env.PORT || 3000;
app.listen(port, (err) => {
	if (err) {
		console.error(err);
		throw err;
	} else {
		console.info(`Listening on port ${port}`);
	}
});