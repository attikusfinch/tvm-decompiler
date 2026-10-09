import "@acton/emulation/testing"
import "@acton/testing/expect"
import "../dedust/cpmm/CpmmPoolV2/wallets"

fun walletTestAddresses(): (any_address, any_address, any_address) {
    return (testing.treasury("wallet-asset").address as any_address,
        testing.treasury("wallet-address").address as any_address,
        testing.treasury("wallet-resolver").address as any_address);
}

get fun `test pool wallet resolver scheduling returns first request flag`() {
    val (asset, _, resolver) = walletTestAddresses();
    val (_, assetHash) = asset.getWorkchainAndHash();
    val (_, resolverHash) = resolver.getWorkchainAndHash();
    var custom: AddressLookup = [];
    custom.set(assetHash, resolver);
    val empty: AddressLookup = [];
    val (requests, isNew, destination) = scheduleWalletResolution(empty, asset, custom);
    expect(isNew).toEqual(true);
    expect(destination as slice).toEqual(resolver as slice);
    expect(requests.mustGet(resolverHash) as slice).toEqual(asset as slice);
    val (_, repeated, _) = scheduleWalletResolution(requests, asset, custom);
    expect(repeated).toEqual(false);
}

get fun `test pool wallet registration creates both lookup directions`() {
    val (asset, wallet, _) = walletTestAddresses();
    val (_, assetHash) = asset.getWorkchainAndHash();
    val empty: AddressLookup = [];
    val wallets = registerPoolWallet(empty, empty, empty, asset, wallet);
    expect(wallets.walletsByAssets.mustGet(assetHash) as slice).toEqual(wallet as slice);
    expect(assetForRegisteredWallet(wallets, wallet) as slice).toEqual(asset as slice);
    expect(wallets.resolutions.isEmpty()).toEqual(true);
}

get fun `test pool wallet resolver reply consumes only its own request`() {
    val (asset, wallet, resolver) = walletTestAddresses();
    val (_, resolverHash) = resolver.getWorkchainAndHash();
    var pending: AddressLookup = [];
    pending.set(resolverHash, asset);
    pending.set(7, asset);
    val empty: AddressLookup = [];
    val wallets = finishWalletResolution({ walletsByAssets: empty, assetsByWallets: empty, resolutions: pending }, resolver, wallet);
    expect(wallets.resolutions.get(resolverHash).isFound).toEqual(false);
    expect(wallets.resolutions.mustGet(7) as slice).toEqual(asset as slice);
    expect(assetForRegisteredWallet(wallets, wallet) as slice).toEqual(asset as slice);
}

get fun `test pool wallet helpers reject wrong workchains duplicates and missing entries`() {
    val (asset, wallet, resolver) = walletTestAddresses();
    val wrong = address.fromWorkchainAndHash(-1, 123) as any_address;
    val empty: AddressLookup = [];
    var exit = 0;
    try { scheduleWalletResolution(empty, wrong, empty); } catch (e) { exit = e; }
    expect(exit).toEqual(32);
    val registered = registerPoolWallet(empty, empty, empty, asset, wallet);
    exit = 0;
    try { registerPoolWallet(registered.walletsByAssets, registered.assetsByWallets, empty, asset, wallet); }
    catch (e) { exit = e; }
    expect(exit).toEqual(39);
    val blank: PoolWallets = { walletsByAssets: empty, assetsByWallets: empty, resolutions: empty };
    exit = 0;
    try { assetForRegisteredWallet(blank, wallet); } catch (e) { exit = e; }
    expect(exit).toEqual(40);
    exit = 0;
    try { finishWalletResolution(blank, resolver, wallet); } catch (e) { exit = e; }
    expect(exit).toEqual(41);
}
