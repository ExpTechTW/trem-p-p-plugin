const crypto6 = require("crypto");
const dgram6 = require("dgram");
const client = dgram6.createSocket("udp4");
const client6 = dgram6.createSocket("udp6");
const dns = require("dns");
const EventEmitter6 = require("events").EventEmitter;
const event = new EventEmitter6();
const event6 = new EventEmitter6();
const bytenode = require("./node_modules/bytenode/lib/index");

class Plugin {
	#ctx;
	TREM;

	constructor(ctx) {
	  	this.#ctx = ctx;
	}

	onLoad() {
		const { TREM, logger, MixinManager, utils } = this.#ctx;

		this.TREM = TREM;

		const config = {
			"server_list": [],
			"server_listv6": [],
			"server_ips": {},
			"server_ips6": {},
		};

		let is_run = false;

		const app = { getVersion(){return "3.1.8"}};

		if (process.platform === "win32") {
			bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./winclient.jar"));
			bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./winclient6.jar"));
		} else if (process.platform === "darwin") {
			if (process.arch === 'x64') {
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./macos_x64_client.jar"));
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./macos_x64_client6.jar"));
			} else if (process.arch === "arm64") {
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./macos_arm64_client.jar"));
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./macos_arm64_client6.jar"));
			}
		} else if (process.platform === "linux") {
			if (process.arch === 'x64') {
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./linux_x64_client.jar"));
				bytenode.runBytecodeFile(utils.path.resolve(__dirname, "./linux_x64_client6.jar"));
			}
		}

		async function get_server_info() {
			try {
				const controller1 = new AbortController();
				setTimeout(() => {
					controller1.abort();
				}, 5_000);
				let ans1 = await fetch("https://cdn.jsdelivr.net/gh/yayacat/API@yayacat/resource/server_list.json", { signal: controller1.signal, cache: "no-cache" })
					.catch((err) => {
						if (err.name === 'AbortError') {
							logger.error("get_server_info AbortError");
						}
					});
				if (controller1.signal.aborted || !ans1) {
					setTimeout(() => get_server_info(), 500);
					return;
				}
				ans1 = await ans1.json();
				config.server_list = ans1.p2pbk;
				config.server_listv6 = ans1.p2pv6;
				// logger.debug(config);
				if (!is_run) init_run();

				for (let address of config.server_list) {
					const server_url = address.split(":");
					dns.resolve4(server_url[0], {family: 4}, (err, address) => {
						if (err) {
							logger.error(err);
						} else {
							config.server_ips[server_url[0]] = address[0];
						}
					});
				}
				for (let address6 of config.server_listv6) {
					const server_url = address6.split("_");
					dns.resolve6(server_url[0], {family: 6}, (err, address) => {
						if (err) {
							logger.error(err);
						} else {
							config.server_ips6[server_url[0]] = address[0];
						}
					});
				}
			} catch (err) {
				logger.error(err);
				setTimeout(() => get_server_info(), 500);
			}
		}

		get_server_info();
		setInterval(() => get_server_info(), 60_000);

		event.on("data", (data) => {
			logger.info(`type {${data.type}} from {p2p}`);
			if (data.type == "eew") this.processEEWData(data);
			// get_data(data, "p2p");
		});
		event.on("log", (data) => {
			if (data.type == 1) {
				logger.info(data.msg);
			} else if (data.type == 2) {
				logger.warn(data.msg);
			} else if (data.type == 3) {
				logger.error(data.msg);
			}
		});
		client.on("listening", () => {
			const address = client.address();
				logger.info(`Client listening on ${address.address}:${address.port}`);
			});
		event6.on("datav6", (data) => {
			logger.info(`type {${data.type}} from {p2pv6}`);
			if (data.type == "eew") this.processEEWData(data);
			// get_data(data, "p2p");
		});
		event6.on("log", (data) => {
			if (data.type == 1) {
				logger.info(data.msg);
			} else if (data.type == 2) {
				logger.warn(data.msg);
			} else if (data.type == 3) {
				logger.error(data.msg);
			}
		});
		client6.on("listening", () => {
		const address = client6.address();
			logger.info(`Client listening on ${address.address}:${address.port}`);
		});

		function init_run() {
			is_run = true;
			init(client, event, {
				server_list: config["server_list"],
			}, crypto6, dns, app);
			initv6(client6, event6, {
				server_listv6: config["server_listv6"],
			}, crypto6, dns, app);
			setInterval(() => {
				TREM.variable.events.emit('p2pinfo', {
					info,
					info6,
					server_ips: config["server_ips"],
					server_ips6: config["server_ips6"],
				});
			}, 3_000);
		}
	}

	processEEWData(data = {}) {
		const currentTime = this.now();
		const EXPIRY_TIME = 240 * 1000;
		const STATUS_3_TIMEOUT = 30 * 1000;

		this.TREM.variable.data.eew
		  .filter((item) =>
			item.eq?.time && (
			  currentTime - item.eq.time > EXPIRY_TIME
			  || item.EewEnd
			  || (item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT)
			),
		  )
		  .forEach((data) => {
			this.TREM.variable.events.emit('EewEnd', {
			  info: { type: this.TREM.variable.play_mode },
			  data: { ...data, type: 'p2p', EewEnd: true },
			});
		  });

		this.TREM.variable.data.eew = this.TREM.variable.data.eew.filter((item) =>
		  item.eq?.time
		  && currentTime - item.eq.time <= EXPIRY_TIME
		  && !item.EewEnd
		  && !(item.status === 3 && currentTime - item.status3Time > STATUS_3_TIMEOUT),
		);

		if (!data.eq?.time || currentTime - data.eq.time > EXPIRY_TIME || data.EewEnd) {
			return;
		}

		const existingIndex = this.TREM.variable.data.eew.findIndex((item) => item.id == data.id);
		const eventData = {
			info: { type: this.TREM.variable.play_mode },
			data: { ...data, type: 'p2p' },
		};

		if (existingIndex == -1) {
			if (!this.TREM.variable.cache.eew_last[data.id]) {
				if (this.TREM.constant.EEW_AUTHOR.includes(data.author)) {
					this.TREM.variable.cache.eew_last[data.id] = {
						last_time: currentTime,
						serial: 1,
					};
					const method = data.author === 'trem' ? 'nsspe' : 'eew';
					this.TREM.variable.data.eew.push({ ...eventData.data, method });
					this.TREM.variable.events.emit('EewRelease', eventData);
				} else if (data.author === "jma" && this.TREM.constant.EEW_AUTHOR.includes("nied")) {
					this.TREM.variable.cache.eew_last[data.id] = {
						last_time: currentTime,
						serial: 1,
					};
					const method = data.author === 'trem' ? 'nsspe' : 'eew';
					this.TREM.variable.data.eew.push({ ...eventData.data, method });
					this.TREM.variable.events.emit('EewRelease', eventData);
				}
				return;
			}
		}

		if (this.TREM.variable.cache.eew_last[data.id] && this.TREM.variable.cache.eew_last[data.id].serial < data.serial) {
			this.TREM.variable.cache.eew_last[data.id].serial = data.serial;

			if (data.status === 3) {
				data.status3Time = currentTime;
			}

			this.TREM.variable.events.emit('EewUpdate', eventData);

			if (data.eq.mag && data.eq.mag != 1) {
				data.method = 'eew';
			}

			if (data.status == 3 && this.TREM.variable.data.eew[existingIndex].status != data.status) {
				this.TREM.variable.events.emit('EewCancel', eventData);
			}

			if (!this.TREM.variable.data.eew[existingIndex].status && data.status == 1) {
				this.TREM.variable.events.emit('EewAlert', eventData);
			}

			this.TREM.variable.data.eew[existingIndex] = data;
		}

		this.cleanupCache('eew_last');

		this.TREM.variable.events.emit('DataEew', {
		  info: { type: this.TREM.variable.play_mode },
		  data: this.TREM.variable.data.eew,
		});
	}

	cleanupCache(cacheKey) {
		const currentTime = this.now();
		Object.keys(this.TREM.variable.cache[cacheKey]).forEach((id) => {
		  const item = this.TREM.variable.cache[cacheKey][id];
		  if (currentTime - item.last_time > 600000) {
			delete this.TREM.variable.cache[cacheKey][id];
		  }
		});
	}

	now() {
		if (this.TREM.variable.play_mode == 2 || this.TREM.variable.play_mode == 3) {
		  if (!this.TREM.variable.replay.local_time) {
			this.TREM.variable.replay.local_time = Date.now();
		  }

		  return this.TREM.variable.replay.start_time + (Date.now() - this.TREM.variable.replay.local_time);
		}

		if (!this.TREM.variable.cache.time.syncedTime || !this.TREM.variable.cache.time.lastSync) {
		  return Date.now();
		}

		const offset = Date.now() - this.TREM.variable.cache.time.lastSync;
		return this.TREM.variable.cache.time.syncedTime + offset;
	}
}

module.exports = Plugin;