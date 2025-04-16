const axios = require('axios');
const { URL } = require('url');

const UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json; charset=utf-8'
    };

    try {
        const params = event.queryStringParameters || {};
        const { url: originalUrl, pwd, type, n } = params;

        if (!originalUrl) {
            return respond(400, { code: 400, msg: '请输入URL' }, headers);
        }

        const processedUrl = processUrl(originalUrl);
        if (!processedUrl) {
            return respond(400, { code: 400, msg: '无效的URL' }, headers);
        }

        const softInfo = await fetchPage(processedUrl);
        if (softInfo.includes('文件取消分享了')) {
            return respond(400, { code: 400, msg: '文件取消分享了' }, headers);
        }

        const { softName, softFilesize } = parseFileInfo(softInfo);

        let postResult;
        if (softInfo.includes('function down_p(){')) {
            if (!pwd) return respond(400, { code: 400, msg: '请输入分享密码' }, headers);
            postResult = await handlePasswordCase(softInfo, processedUrl, pwd);
        } else {
            postResult = await handleNormalCase(softInfo, processedUrl);
        }

        if (postResult.zt !== 1) {
            return respond(400, { code: 400, msg: postResult.inf }, headers);
        }

        let downUrl = `${postResult.dom}/file/${postResult.url}`;
        const finalUrl = await getRedirectUrl(downUrl);
        downUrl = finalUrl || downUrl;

        if (n) {
            const urlObj = new URL(downUrl);
            urlObj.searchParams.set('fn', n);
            downUrl = urlObj.toString();
        }

        downUrl = downUrl.replace(/pid=[^&]*&?/, '');

        if (type === 'down') {
            return {
                statusCode: 302,
                headers: { ...headers, Location: downUrl },
                body: ''
            };
        }

        return respond(200, {
            code: 200,
            msg: '解析成功',
            name: softName,
            filesize: softFilesize,
            downUrl
        }, headers);

    } catch (error) {
        console.error('Error:', error);
        return respond(500, { code: 500, msg: '服务器错误' }, headers);
    }
};

function respond(statusCode, data, headers) {
    return {
        statusCode,
        headers,
        body: JSON.stringify(data, null, 4)
    };
}

function processUrl(url) {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
        return `https://www.lanzoup.com/${path}`;
    } catch {
        return null;
    }
}

async function fetchPage(url) {
    const response = await axios.get(url, {
        headers: {
            'User-Agent': UserAgent,
            'X-FORWARDED-FOR': randIP(),
            'CLIENT-IP': randIP()
        }
    });
    return response.data;
}

function parseFileInfo(html) {
    const softNameMatch = html.match(/style="font-size: 30px;text-align: center;padding: 56px 0px 20px 0px;">([\s\S]*?)<\/div>/) ||
        html.match(/<div class="n_box_3fn".*?>([\s\S]*?)<\/div>/) ||
        html.match(/var filename = '([\s\S]*?)';/) ||
        html.match(/div class="b"><span>([\s\S]*?)<\/span><\/div>/);

    const softFilesizeMatch = html.match(/<div class="n_filesize".*?>大小：([\s\S]*?)<\/div>/) ||
        html.match(/<span class="p7">文件大小：<\/span>([\s\S]*?)<br>/);

    return {
        softName: softNameMatch ? softNameMatch[1] : '',
        softFilesize: softFilesizeMatch ? softFilesizeMatch[1] : ''
    };
}

async function handlePasswordCase(html, referer, pwd) {
    const signRegex = /'sign':'(.*?)',/g;
    const signs = [];
    let match;
    while ((match = signRegex.exec(html)) !== null) signs.push(match[1]);
    
    const ajaxmMatch = html.match(/ajaxm\.php\?file=(\d+)/);
    const ajaxUrl = `https://www.lanzoux.com/${ajaxmMatch[0]}`;

    const response = await axios.post(ajaxUrl, {
        action: 'downprocess',
        sign: signs[1],
        p: pwd,
        kd: 1
    }, {
        headers: {
            'User-Agent': UserAgent,
            'Referer': referer,
            'X-FORWARDED-FOR': randIP(),
            'CLIENT-IP': randIP()
        }
    });

    return response.data;
}

async function handleNormalCase(html, referer) {
    const iframeMatch = html.match(/<iframe.*?src="\/(.*?)"/);
    const iframeUrl = `https://www.lanzoup.com/${iframeMatch[1]}`;
    
    const iframeContent = await fetchPage(iframeUrl);
    const signMatch = iframeContent.match(/wp_sign = '([\s\S]*?)'/);
    
    const ajaxmMatch = iframeContent.match(/ajaxm\.php\?file=(\d+)/);
    const ajaxUrl = `https://www.lanzoux.com/${ajaxmMatch[0]}`;

    const response = await axios.post(ajaxUrl, {
        action: 'downprocess',
        signs: '?ctdf',
        sign: signMatch[1],
        kd: 1
    }, {
        headers: {
            'User-Agent': UserAgent,
            'Referer': iframeUrl,
            'X-FORWARDED-FOR': randIP(),
            'CLIENT-IP': randIP()
        }
    });

    return response.data;
}

async function getRedirectUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': UserAgent,
                'Cookie': 'down_ip=1;',
                'Referer': 'https://developer.lanzoug.com'
            },
            maxRedirects: 0
        });
        return url;
    } catch (error) {
        if (error.response && [301, 302].includes(error.response.status)) {
            return error.response.headers.location;
        }
        return url;
    }
}

function randIP() {
    const arr = ["218","66","60","202","204","59","61","222","221","62","63","64","122","211"];
    const ip1 = arr[Math.floor(Math.random() * arr.length)];
    const parts = Array.from({length: 3}, () => Math.floor(Math.random() * 255) + 1);
    return `${ip1}.${parts.join('.')}`;
}