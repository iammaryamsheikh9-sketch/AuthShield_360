import "dotenv/config";
import app from "./src/app.js";
import connectDatabase from "./src/config/connectDatabase.js";
import { seedInitialData } from "./src/utils/seedData.js";
import getAuthPhase from "./src/config/authPhase.js";

const port = Number(process.env.PORT) || 5000;

if (process.env.NODE_ENV === "production") {
	const missingProductionSettings = [
		["FRONTEND_URL", process.env.FRONTEND_URL],
		["MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY]
	].filter(([, value]) => !value).map(([key]) => key);
	if (getAuthPhase() === 3) {
		["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "EMAIL_FROM"].forEach((key) => {
			if (!process.env[key]) missingProductionSettings.push(key);
		});
	}
	if (missingProductionSettings.length) {
		throw new Error(`Missing production settings: ${missingProductionSettings.join(", ")}`);
	}
}

await connectDatabase();
await seedInitialData();

app.listen(port, () => {
	console.log(`AuthShield 360 API listening on port ${port} (auth phase ${getAuthPhase()})`);
});
