const vscode = require('vscode');
const axios = require('axios').default;
let stockApi = '';
let statusBarItems = {};
let stockCodes = [];
let updateInterval = 10000;
let timer = null;
let showTimer = null;

function activate(context) {
	init();
	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(handleConfigChange)
	);
}
exports.activate = activate;

function deactivate() {}
exports.deactivate = deactivate;

function init() {
	initShowTimeChecker();
	if (isShowTime()) {
		stockCodes = getStockCodes();
		updateInterval = getUpdateInterval();
        stockApi = getStockApi();
		fetchAllData();
		timer = setInterval(fetchAllData, updateInterval);
	} else {
        timer && clearInterval(timer)
		hideAllStatusBar();
	}
}

function initShowTimeChecker() {
	showTimer && clearInterval(showTimer);
	showTimer = setInterval(init, 1000 * 60 * 10);
}

function hideAllStatusBar() {
	Object.keys(statusBarItems).forEach((item) => {
		statusBarItems[item].hide();
		statusBarItems[item].dispose();
	});
}

function handleConfigChange() {
	timer && clearInterval(timer);
    timer = null;
	showTimer && clearInterval(showTimer);
    showTimer = null;
	const codes = getStockCodes();
	Object.keys(statusBarItems).forEach((item) => {
		if (codes.indexOf(item) === -1) {
			statusBarItems[item].hide();
			statusBarItems[item].dispose();
			delete statusBarItems[item];
		}
	});
    stockApi = getStockApi();
	init();
}

function getStockCodes() {
	const config = vscode.workspace.getConfiguration();
	const stocks = config.get('stock-watch.stocks');
	return stocks.map((code) => {
        code = code.toUpperCase();
        if (code.indexOf('SZ') == -1 && code.indexOf('SH') == -1) {
            return;
        }
        return code;
	});
}

function getUpdateInterval() {
	const config = vscode.workspace.getConfiguration();
	return config.get('stock-watch.updateInterval');
}

// stock api
// 枚举，获取stock api来源
function getStockApi() {
    const config = vscode.workspace.getConfiguration();
	return config.get('stock-watch.api');
}

function isShowTime() {
	const config = vscode.workspace.getConfiguration();
	const configShowTime = config.get('stock-watch.showTime');
	let showTime = [0, 23];
	if (
		Array.isArray(configShowTime) &&
		configShowTime.length === 2 &&
		configShowTime[0] <= configShowTime[1]
	) {
		showTime = configShowTime;
	}
	const now = new Date().getHours();
	return now >= showTime[0] && now <= showTime[1];
}

function getItemText(item) {
	return `「${item.name}」${keepDecimal(item.price, calcFixedNumber(item))} ${
		item.percent >= 0 ? '📈' : '📉'
	} ${keepDecimal(item.percent * 100, 2)}%`;
}

function getTooltipText(item) {
	return `【今日行情】${item.type}${item.symbol}\n涨跌：${
		item.updown
	}   百分：${keepDecimal(item.percent * 100, 2)}%\n最高：${
		item.high
	}   最低：${item.low}\n今开：${item.open}   昨收：${item.yestclose}`;
}

function getItemColor(item) {
	const config = vscode.workspace.getConfiguration();
	const riseColor = config.get('stock-watch.riseColor');
	const fallColor = config.get('stock-watch.fallColor');

	return item.percent >= 0 ? riseColor : fallColor;
}

function neteaseFetch() {
    let baseUrl = 'https://api.money.126.net/data/feed/';
    let stockList = stockCodes.map(code => {
        return code.replace('SZ', '1').replace('SH', '0');
    });
    axios
		.get(`${baseUrl}${stockList.join(',')}?callback=a`)
		.then(
			(rep) => {
				try {
					const result = JSON.parse(rep.data.slice(2, -2));
					let data = [];
					Object.keys(result).map((item) => {
						if (!result[item].code) {
							result[item].code = item; //兼容港股美股
						}
						data.push(result[item]);
					});
					displayData(data);
				} catch (error) {}
			},
			(error) => {
				console.error(error);
			}
		)
		.catch((error) => {
			console.error(error);
		});
}

function xueqiuFetch() {
    let baseUrl = 'https://stock.xueqiu.com/v5/stock/realtime/quotec.json?symbol=';
    axios.get(`${baseUrl}${stockCodes.join(',')}`)
        .then(
            (rep) => {
                console.log(rep);
                try {
                    const result = rep.data;
                    let data = [];
                    if (result.data) {
                       result.data.map(v => {
                            let item = {};
                            item.name = v['symbol'];
                            item.price = v['current'];
                            item.percent = v['percent'];
                            item.symbol = v['symbol'];
                            item.high = v['high'];
                            item.low = v['low'];
                            item.open = v['open'];
                            item.yestclose = v['last_close'];
                            data.push(item);
                        });
                    }
                    displayData(data);
                } catch (error) {
                    console.error(error);
                }
            }
        )
        .catch(error => {
            console.error(error);
        });
}

function fetchAllData() {
	console.log('fetchAllData');
    if (stockApi === 'netease') {
        return neteaseFetch();
    } else if (stockApi === 'xueqiu') {
        return xueqiuFetch();
    } else {
        console.log('not set api source');
    }
}

function displayData(data) {
	data.map((item) => {
		const key = item.code;
		if (statusBarItems[key]) {
			statusBarItems[key].text = getItemText(item);
			statusBarItems[key].color = getItemColor(item);
			statusBarItems[key].tooltip = getTooltipText(item);
		} else {
			statusBarItems[key] = createStatusBarItem(item);
		}
	});
}

function createStatusBarItem(item) {
	const barItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Left,
		0 - stockCodes.indexOf(item.code)
	);
	barItem.text = getItemText(item);
	barItem.color = getItemColor(item);
	barItem.tooltip = getTooltipText(item);
	barItem.show();
	return barItem;
}

function keepDecimal(num, fixed) {
	var result = parseFloat(num);
	if (isNaN(result)) {
		return '--';
	}
	return result.toFixed(fixed);
}

function calcFixedNumber(item) {
	var high =
		String(item.high).indexOf('.') === -1
			? 0
			: String(item.high).length - String(item.high).indexOf('.') - 1;
	var low =
		String(item.low).indexOf('.') === -1
			? 0
			: String(item.low).length - String(item.low).indexOf('.') - 1;
	var open =
		String(item.open).indexOf('.') === -1
			? 0
			: String(item.open).length - String(item.open).indexOf('.') - 1;
	var yest =
		String(item.yestclose).indexOf('.') === -1
			? 0
			: String(item.yestclose).length -
			  String(item.yestclose).indexOf('.') -
			  1;
	var updown =
		String(item.updown).indexOf('.') === -1
			? 0
			: String(item.updown).length - String(item.updown).indexOf('.') - 1;
	var max = Math.max(high, low, open, yest, updown);

	if (max === 0) {
		max = 2;
	}

	return max;
}
