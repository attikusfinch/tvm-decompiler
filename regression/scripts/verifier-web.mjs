export function publicationWebConfig(port, publicOrigin) {
    const localOrigin = 'http://127.0.0.1:' + port;
    const origins = new Set([localOrigin]);
    const hosts = new Set(['127.0.0.1:' + port]);
    if (publicOrigin) {
        const url = new URL(publicOrigin);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
            throw new Error('VERIFIER_PUBLIC_ORIGIN must be an HTTPS origin without a path');
        publicOrigin = url.origin;
        hosts.add(url.host); origins.add(url.origin);
    }
    return {localOrigin, publicOrigin, hosts, origins};
}

export function pageToken(config, token) {
    // On a public tunnel the operator uses a URL fragment. It never travels in
    // HTTP requests, and the public HTML must not disclose the queue credential.
    return config.publicOrigin ? '' : token;
}
