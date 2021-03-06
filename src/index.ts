import 'dotenv/config';

import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import fastify from 'fastify';
import fastifyCors from 'fastify-cors';
import fastifyRateLimit from 'fastify-rate-limit';
import got from 'got';

const twitchCheckLiveApi = `https://api.twitch.tv/helix/streams?user_login=leonzacagedlion`;

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('America/Toronto');

const app = fastify();
app.register(fastifyCors, {
	origin: true,
});
app.register(fastifyRateLimit, {
	max: 3,
	timeWindow: '10 seconds',
});
const streamingUrl = process.env.STREAMING_URL as string;
const streamAnchorLink = `<a href='${streamingUrl}'>${streamingUrl}</a>`;

let lastTimestampChecked = 0;
let lastStatus = '';
let timestampOffline: number | undefined;

// 15 minutes for me to go live if I ever go offline
const bufferSeconds = 15 * 60;

function createLastStatusMessage() {
	return `${lastStatus} (last checked: ${Math.round(
		(Date.now() - lastTimestampChecked) / 1000
	)} seconds ago)`;
}

async function getAccessToken() {
	const response = await got.post(
		`https://id.twitch.tv/oauth2/token?client_id=${process.env.TWITCH_CLIENT_ID}&client_secret=${process.env.TWITCH_CLIENT_SECRET}&grant_type=client_credentials`
	);

	return JSON.parse(response.body).access_token;
}

async function updateStatus() {
	const accessToken = await getAccessToken();
	const response = await got.get(twitchCheckLiveApi, {
		headers: {
			'Client-Id': process.env.TWITCH_CLIENT_ID,
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (JSON.parse(response.body).data?.[0]?.type === 'live') {
		lastStatus = `User is live at ${streamAnchorLink}.`;
		timestampOffline = undefined;
		return;
	}

	if (timestampOffline === undefined) {
		timestampOffline = Date.now();
	}

	const secondsElapsed = (Date.now() - timestampOffline) / 1000;
	const minutesRemaining = Math.ceil((bufferSeconds - secondsElapsed) / 60);

	if (minutesRemaining > 0) {
		lastStatus = `Leon is not live at ${streamAnchorLink}; the gift card will be revealed if he fails to go live in ${minutesRemaining} minute${
			minutesRemaining === 1 ? '' : 's'
		}.`;
	} else {
		lastStatus = `Leon has not been live at ${streamAnchorLink} for ${
			bufferSeconds / 60
		} minutes. Gift card code: ${process.env.GIFT_CARD_CODE}`;
	}
}

enum Weekday {
	sunday = 0,
	monday = 1,
	tuesday = 2,
	wednesday = 3,
	thursday = 4,
	friday = 5,
	saturday = 6,
}

function createScheduleMessage() {
	return `The lion isn't currently obliged to stay in his cage at ${streamAnchorLink}. He's scheduled to be live from 4:30pm to 9:30pm on weekdays, and from 8:30am to 9:30pm on weekends. If you find that he isn't in his cage by then (i.e. not streaming), you'll receive compensation (in the form of a gift card code) for your trouble ;)`;
}

// Limit URL checks to once every minute
app.get('/check', async (request, reply) => {
	// On weekends, don't check before 9am or after 9pm
	const today = dayjs();
	const weekday = today.tz().day();
	const hour = today.tz().hour();
	const minute = today.tz().minute();
	const minutes = hour * 60 + minute;

	// Don't check on weekends before 8:30 AM or after 9:30 PM
	if (weekday === Weekday.saturday || weekday === Weekday.sunday) {
		if (minutes < 8 * 60 + 30 || minutes > 21 * 60 + 30) {
			return reply.send(createScheduleMessage());
		}
	}
	// Don't check on weekdays before 4:30 AM or after 9:30 PM
	else {
		if (minutes < 16 * 60 + 30 || minutes > 21 * 60 + 30) {
			return reply.send(createScheduleMessage());
		}
	}

	// If a minute has elapsed since the last check, recheck and update the status
	if (Date.now() - lastTimestampChecked >= 60 * 1000) {
		lastTimestampChecked = Date.now();
		await updateStatus();
	}

	return reply.send(createLastStatusMessage());
});

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', (err) => {
	if (err) {
		console.error(err);
		throw err;
	} else {
		console.info(`Listening on port ${port}`);
	}
});
