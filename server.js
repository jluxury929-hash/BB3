/**
 * 🔱 APEX v38.9.18 - THE WHALE HUNTER (DYNAMIC)
 * Strategy: Mempool Whale-Tracking + Dynamic Flash Loans
 * Target: 0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0
 */

const { ethers, Wallet, WebSocketProvider } = require('ethers');

const CONFIG = {
    CHAIN_ID: 8453,
    TARGET_CONTRACT: "0x83EF5c401fAa5B9674BAfAcFb089b30bAc67C9A0",
    WSS_URL: "wss://base-mainnet.g.alchemy.com/v2/G-WBAMA8JxJMjkc-BCeoK",
    WETH: "0x4200000000000000000000000000000000000006",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    
    // --- WHALE FILTERS ---
    WHALE_THRESHOLD_ETH: ethers.parseEther("10"), // Only simulate if a pending tx > 10 ETH
    MIN_PROFIT_BUFFER: "0.008", // ~$25 net floor after all costs
    GAS_LIMIT: 950000n 
};

async function startWhaleBot() {
    const provider = new WebSocketProvider(CONFIG.WSS_URL);
    const signer = new Wallet(process.env.TREASURY_PRIVATE_KEY, provider);

    console.log(`\n🐋 TITAN WHALE HUNTER ARMED`);
    console.log(`📡 FILTER: Transactions > ${ethers.formatEther(CONFIG.WHALE_THRESHOLD_ETH)} ETH`);

    provider.on("pending", async (txHash) => {
        try {
            const tx = await provider.getTransaction(txHash);
            
            // 1. WHALE SENSE: Ignore small retail trades to save RPC credits
            if (!tx || !tx.value || tx.value < CONFIG.WHALE_THRESHOLD_ETH) return;

            console.log(`\n🚨 WHALE DETECTED: ${ethers.formatEther(tx.value)} ETH swap pending...`);

            // 2. DYNAMIC LOAN SIZE (Based on your Treasury)
            const balanceWei = await provider.getBalance(signer.address);
            const balanceEth = parseFloat(ethers.formatEther(balanceWei));
            const currentLoanAmount = calculateDynamicLoan(balanceEth);

            // 3. PROFITABILITY GUARD
            const feeData = await provider.getFeeData();
            const simulationData = encodeTitanCall(currentLoanAmount); 
            
            // Simulate the outcome
            const rawProfit = await provider.call({
                to: CONFIG.TARGET_CONTRACT,
                data: simulationData,
                from: signer.address
            });

            const netValue = BigInt(rawProfit);
            const gasCost = CONFIG.GAS_LIMIT * (feeData.maxFeePerGas || feeData.gasPrice);
            const aaveFee = (currentLoanAmount * 5n) / 10000n; // 0.05% Aave fee
            const minBuffer = ethers.parseEther(CONFIG.MIN_PROFIT_BUFFER);

            // 4. TOTAL PROFIT CHECK
            // Must cover: Gas + Aave Fee + Your desired minimum take-home profit
            if (netValue > (gasCost + aaveFee + minBuffer)) {
                const totalExpenses = gasCost + aaveFee;
                const profit = ethers.formatEther(netValue - totalExpenses);
                
                console.log(`✅ PROFITABLE GAP FOUND!`);
                console.log(`💰 Est. Net Profit: ${profit} ETH (after fees)`);
                
                const strikeTx = await signer.sendTransaction({
                    to: CONFIG.TARGET_CONTRACT,
                    data: simulationData,
                    gasLimit: CONFIG.GAS_LIMIT,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
                    maxFeePerGas: feeData.maxFeePerGas,
                    type: 2
                });
                console.log(`🚀 STRIKE BROADCASTED: ${strikeTx.hash}`);
            }
        } catch (e) {
            // Silence simulation reverts (they just mean 'no profit found')
        }
    });
}

function calculateDynamicLoan(ethBalance) {
    const usd = ethBalance * 3300; // Estimated ETH price
    if (usd >= 200) return ethers.parseEther("100");
    if (usd >= 100) return ethers.parseEther("75");
    if (usd >= 75)  return ethers.parseEther("50");
    if (usd >= 30)  return ethers.parseEther("25");
    return ethers.parseEther("10");
}

function encodeTitanCall(amount) {
    const iface = new ethers.Interface(["function requestTitanLoan(address,uint256,address[])"]);
    return iface.encodeFunctionData("requestTitanLoan", [CONFIG.WETH, amount, [CONFIG.WETH, CONFIG.USDC]]);
}

startWhaleBot().catch(console.error);
