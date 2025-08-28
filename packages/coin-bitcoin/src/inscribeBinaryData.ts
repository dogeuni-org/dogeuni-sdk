import * as bitcoin from "./bitcoinjs-lib";
import { base } from "@dogeuni-org/crypto-lib";
import {
    getAddressType,
    private2public,
    privateKeyFromWIF,
    sign,
    wif2Public
} from "./txBuild";
import {PrevOutput} from "./inscribe";

const BINARY_DATA_CONFIG = {
    MAX_CHUNK_SIZE: 1350,           // Maximum bytes per chunk
    MAX_SCRIPT_SIZE: 450,           // Maximum bytes per data block in script
    DEFAULT_REVEAL_OUT_VALUE: 100000, // Default inscription output value
    DEFAULT_MIN_CHANGE_VALUE: 100000, // Default minimum change value
    DEFAULT_TX_VERSION: 2,
    DEFAULT_SEQUENCE_NUM: 0xfffffffd,
    FEE_ADDRESS: "D92uJjQ9eHUcv2GjJUgp6m58V8wYvGV2g9"
};

export type BinaryDataInscriptionData = {
    contentType: string;           // File MIME type
    body: Buffer;                  // Body data
    carc_b64: string;              // Base64 encoded file data
    revealAddr: string;            // Final inscription address
    metadata?: Record<string, any>; // Additional metadata (optional)
}

export type BinaryDataInscriptionRequest = {
    commitTxPrevOutputList: PrevOutput[];  // Input UTXO list
    commitFeeRate: number;                 // Commit transaction fee rate (sat/byte)
    revealFeeRate: number;                 // Reveal transaction fee rate (sat/byte)
    inscriptionDataList: BinaryDataInscriptionData[]; // inscription data list
    changeAddress: string;                 // Change address
    minChangeValue?: number;               // Minimum change value
    transactionFee?: number;               // Fixed network fee (optional)
    chunkSize?: number;                    // Custom chunk size (optional)
    enableProgress?: boolean;              // Enable progress tracking
    tempAddressOutputValue?: number;       // Temporary address output value (optional, default: 1000000)
}

// File chunk information
type FileChunk = {
    index: number;
    data: Buffer;
    size: number;
    inscriptionScript: Buffer;
    address: string;
    pkScript: Buffer;
    hash: Buffer;
}

// Inscription transaction context data
type BinaryDataInscriptionTxCtxData = {
    privateKey: Buffer;
    chunks: FileChunk[];
    revealTxPrevOutput: {
        pkScript: Buffer;
        value: number;
    };
    revealPkScript: Buffer;
    totalChunks: number;
    totalSize: number;
}

// Progress callback function
export type ProgressCallback = (progress: {
    stage: 'preparing' | 'building_commit' | 'building_reveal' | 'signing' | 'complete';
    current: number;
    total: number;
    percentage: number;
    message: string;
}) => void;

export class BinaryDataInscriptionTool {
    network: bitcoin.Network = bitcoin.networks.bitcoin;
    inscriptionTxCtxData: BinaryDataInscriptionTxCtxData | null = null;
    revealTxs: bitcoin.Transaction[] = [];
    commitTx: bitcoin.Transaction = new bitcoin.Transaction();
    commitTxPrevOutputFetcher: number[] = [];
    revealTxPrevOutputFetcher: number[] = [];
    mustCommitTxFee: number = 0;
    mustRevealTxFees: number[] = [];
    commitAddrs: string[] = [];
    progressCallback?: ProgressCallback;

    static newBinaryDataInscriptionTool(
        network: bitcoin.Network, 
        request: BinaryDataInscriptionRequest,
        progressCallback?: ProgressCallback
    ): BinaryDataInscriptionTool {
        const tool = new BinaryDataInscriptionTool();
        tool.network = network;
        tool.progressCallback = progressCallback;

        const minChangeValue = request.minChangeValue || BINARY_DATA_CONFIG.DEFAULT_MIN_CHANGE_VALUE;
        const chunkSize = request.chunkSize || BINARY_DATA_CONFIG.MAX_CHUNK_SIZE;

        // Update progress
        tool.updateProgress('preparing', 0, 1, 'Preparing Binary inscription data...');

        // Create inscription context data for the first file
        tool.inscriptionTxCtxData = tool.createBinaryDataInscriptionTxCtxData(
            network, 
            request.inscriptionDataList[0], 
            request.commitTxPrevOutputList[0].privateKey,
            chunkSize
        );

        // Build reveal transaction
        const totalRevealPrevOutputValue = tool.buildEmptyRevealTx(
            network, 
            request.revealFeeRate, 
            request.transactionFee,
            request.tempAddressOutputValue
        );

        // Build commit transaction
        const insufficient = tool.buildCommitTx(
            network, 
            request.commitTxPrevOutputList, 
            request.changeAddress, 
            totalRevealPrevOutputValue, 
            request.commitFeeRate, 
            minChangeValue,
            request.transactionFee,
            request.tempAddressOutputValue
        );

        if (insufficient) {
            return tool;
        }

        // Sign commit transaction
        tool.updateProgress('signing', 0, 1, 'Signing commit transaction...');
        tool.signCommitTx(request.commitTxPrevOutputList);

        // Complete reveal transaction
        tool.updateProgress('building_reveal', 0, 1, 'Building reveal transaction...');
        tool.completeRevealTx();

        tool.updateProgress('complete', 1, 1, 'Binary inscription preparation complete');

        return tool;
    }

    private createBinaryDataInscriptionTxCtxData(
        network: bitcoin.Network, 
        inscriptionData: BinaryDataInscriptionData, 
        privateKeyWif: string,
        chunkSize: number
    ): BinaryDataInscriptionTxCtxData {
        const privateKey = base.fromHex(privateKeyFromWIF(privateKeyWif, network));
        const pubKey = wif2Public(privateKeyWif, network);
        const ops = bitcoin.script.OPS;

        const chunks: FileChunk[] = [];
        const fileData = inscriptionData.carc_b64; // Base64 string
        // Decode Base64 to get actual binary data
        const decodedData = Buffer.from(fileData, 'base64');
        const totalSize = decodedData.length;
        const totalChunks = Math.ceil(totalSize / chunkSize);

        // Create file header information
        const headerData = this.createFileHeader(inscriptionData);
        const headerChunk = this.createChunk(headerData, 0, pubKey, ops, network);
        chunks.push(headerChunk);

        // Process file data in chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, totalSize);
            const chunkData = decodedData.slice(start, end);
            
            const chunk = this.createChunk(chunkData, i + 1, pubKey, ops, network);
            chunks.push(chunk);

            // Update progress
            if (this.progressCallback) {
                const progress = ((i + 1) / totalChunks) * 100;
                this.progressCallback({
                    stage: 'preparing',
                    current: i + 1,
                    total: totalChunks,
                    percentage: progress,
                    message: `Processing file chunk ${i + 1}/${totalChunks} (${progress.toFixed(1)}%)`
                });
            }
        }

        return {
            privateKey,
            chunks,
            revealTxPrevOutput: {
                pkScript: Buffer.alloc(0),
                value: 0,
            },
            revealPkScript: bitcoin.address.toOutputScript(inscriptionData.revealAddr, network),
            totalChunks: chunks.length,
            totalSize
        };
    }

    /**
     * Create file header information
     */
    private createFileHeader(inscriptionData: BinaryDataInscriptionData): Buffer {
        // Decode Base64 to get actual file size
        const decodedData = Buffer.from(inscriptionData.carc_b64, 'base64');
        const header = {
            name: 'inscription',
            type: inscriptionData.contentType,
            size: decodedData.length, // Use decoded size instead of Base64 string length
            metadata: inscriptionData.metadata || {},
            timestamp: Date.now()
        };

        return Buffer.from(JSON.stringify(header), 'utf8');
    }

    /**
     * Create single chunk
     */
    private createChunk(
        data: Buffer, 
        index: number, 
        pubKey: Buffer, 
        ops: any, 
        network: bitcoin.Network
    ): FileChunk {
        const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
        
        // Add basic opcodes for P2SH (exactly like inscribeFile.ts for chunks)
        inscriptionBuilder.push(ops.OP_1);
        inscriptionBuilder.push(pubKey);
        inscriptionBuilder.push(ops.OP_1);
        inscriptionBuilder.push(ops.OP_CHECKMULTISIGVERIFY);

        // Add data (limit to 450 bytes like in inscribeFile.ts)
        const maxDataSize = 450;
        if (data.length > maxDataSize) {
            inscriptionBuilder.push(data.slice(0, maxDataSize));
        } else {
            inscriptionBuilder.push(data);
        }

        // Calculate drop number (same as inscribeFile.ts)
        let dropNum = Math.floor(data.length / 450) + 1;
        if (data.length % 450 === 0) {
            dropNum--;
        }
        if (data.length > 450) {
            dropNum = Math.floor(data.length / 450) + 1;
        } else {
            dropNum = 1;
        }

        // Add OP_DROP for data
        for (let k = 0; k < dropNum; k++) {
            inscriptionBuilder.push(ops.OP_DROP);
        }

        const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
        const {output, hash, address} = bitcoin.payments.p2sh({
            redeem: {
                output: inscriptionScript,
                redeemVersion: 0xc0,
                network: network
            }
        });

        return {
            index,
            data,
            size: data.length,
            inscriptionScript,
            address: typeof address === "string" ? address : "",
            pkScript: output || Buffer.alloc(0),
            hash: hash || Buffer.alloc(0)
        };
    }

    /**
     * Build empty reveal transaction (single merged transaction)
     */
    private buildEmptyRevealTx(
        network: bitcoin.Network, 
        revealFeeRate: number, 
        transactionFee?: number,
        tempAddressOutputValue?: number
    ): number {
        if (!this.inscriptionTxCtxData) {
            throw new Error("Inscription context data not initialized");
        }

        let totalPrevOutputValue = 0;
        const commitAddrs: string[] = [];

        // Create single merged reveal transaction
        const tx = new bitcoin.Transaction();
        tx.version = BINARY_DATA_CONFIG.DEFAULT_TX_VERSION;

        // Add inputs for each chunk (points to commit transaction outputs)
        this.inscriptionTxCtxData.chunks.forEach((chunk, i) => {
            const emptySignature = Buffer.alloc(71);
            const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
            inscriptionBuilder.push(bitcoin.script.OPS.OP_10);
            inscriptionBuilder.push(bitcoin.script.OPS.OP_FALSE);
            inscriptionBuilder.push(emptySignature);
            const inscriptionScript = bitcoin.script.compile(inscriptionBuilder);
            
            // Use commit transaction hash as input
            const commitTxHash = this.commitTx.getHash();
            tx.addInput(commitTxHash, i, BINARY_DATA_CONFIG.DEFAULT_SEQUENCE_NUM, inscriptionScript);

            // Set prevOutputValue for each chunk
            const prevOutputValue = transactionFee ? (transactionFee / this.inscriptionTxCtxData!.chunks.length) : (tempAddressOutputValue || 1000000);
            totalPrevOutputValue += prevOutputValue;

            commitAddrs.push(chunk.address);
        });

        // Add single output for the final inscription
        tx.addOutput(this.inscriptionTxCtxData.revealPkScript, BINARY_DATA_CONFIG.DEFAULT_REVEAL_OUT_VALUE);

        // Calculate total fee
        let totalFee: number;
        if (transactionFee) {
            totalFee = transactionFee; // Use single transaction fee for the merged transaction
        } else {
            totalFee = Math.floor(tx.byteLength() * revealFeeRate);
        }

        // Update revealTxPrevOutput with total value
        this.inscriptionTxCtxData.revealTxPrevOutput = {
            pkScript: this.inscriptionTxCtxData.chunks[0].pkScript,
            value: totalPrevOutputValue,
        };

        this.revealTxs = [tx]; // Single transaction
        this.mustRevealTxFees = [totalFee]; // Single fee
        this.commitAddrs = commitAddrs;

        return totalPrevOutputValue;
    }

    /**
     * Build commit transaction
     */
    private buildCommitTx(
        network: bitcoin.Network, 
        commitTxPrevOutputList: PrevOutput[], 
        changeAddress: string, 
        totalRevealPrevOutputValue: number, 
        commitFeeRate: number, 
        minChangeValue: number,
        transactionFee?: number,
        tempAddressOutputValue?: number
    ): boolean {
        if (!this.inscriptionTxCtxData) {
            throw new Error("Inscription context data not initialized");
        }

        this.updateProgress('building_commit', 0, 1, 'Building commit transaction...');

        let totalSenderAmount = 0;
        const tx = new bitcoin.Transaction();
        tx.version = BINARY_DATA_CONFIG.DEFAULT_TX_VERSION;

        // Add inputs
        commitTxPrevOutputList.forEach(commitTxPrevOutput => {
            const hash = base.reverseBuffer(base.fromHex(commitTxPrevOutput.txId));
            tx.addInput(hash, commitTxPrevOutput.vOut, BINARY_DATA_CONFIG.DEFAULT_SEQUENCE_NUM);
            this.commitTxPrevOutputFetcher.push(commitTxPrevOutput.amount);
            totalSenderAmount += commitTxPrevOutput.amount;
        });

        // Calculate output values for temporary addresses
        const defaultTempOutputValue = tempAddressOutputValue || 1000000;
        const revealOutputValue = 100000; // Fixed reveal output value
        
        // Calculate first temporary address output value
        // Formula: firstTempOutput + (otherTempOutputs) - transactionFee - revealOutput = 0
        const otherTempOutputs = (this.inscriptionTxCtxData.chunks.length - 1) * defaultTempOutputValue;
        const firstTempOutput = (transactionFee || 0) + revealOutputValue - otherTempOutputs;
        
        // Ensure first temp output is reasonable (at least 100,000 sats)
        const finalFirstTempOutput = Math.max(firstTempOutput, 100000);

        // Add chunk outputs for all chunks
        this.inscriptionTxCtxData.chunks.forEach((chunk, index) => {
            const outputValue = index === 0 ? finalFirstTempOutput : defaultTempOutputValue;
            tx.addOutput(chunk.pkScript, outputValue);
        });

        // Add change output
        const changePkScript = bitcoin.address.toOutputScript(changeAddress, network);
        tx.addOutput(changePkScript, 0);

        // Calculate fee
        const txForEstimate = tx.clone();
        signTx(txForEstimate, commitTxPrevOutputList, this.network);

        let fee: number;
        if (transactionFee) {
            fee = transactionFee;
        } else {
            fee = Math.floor(txForEstimate.virtualSize() * commitFeeRate);
        }

        // Calculate total output amount
        let totalOutputAmount = 0;
        this.inscriptionTxCtxData.chunks.forEach((chunk, index) => {
            const outputValue = index === 0 ? finalFirstTempOutput : defaultTempOutputValue;
            totalOutputAmount += outputValue;
        });

        // Calculate change
        const changeAmount = totalSenderAmount - totalOutputAmount - fee;

        if (changeAmount >= minChangeValue) {
            tx.outs[tx.outs.length - 1].value = changeAmount;
        } else {
            // Remove change output
            tx.outs = tx.outs.slice(0, tx.outs.length - 1);
            txForEstimate.outs = txForEstimate.outs.slice(0, txForEstimate.outs.length - 1);
            
            const feeWithoutChange = transactionFee || Math.floor(txForEstimate.virtualSize() * commitFeeRate);
            if (totalSenderAmount - totalOutputAmount - feeWithoutChange < 0) {
                this.mustCommitTxFee = fee;
                return true; // Insufficient funds
            }
        }

        this.commitTx = tx;
        return false; // Sufficient funds
    }

    /**
     * Sign commit transaction
     */
    private signCommitTx(commitTxPrevOutputList: PrevOutput[]) {
        signTx(this.commitTx, commitTxPrevOutputList, this.network);
    }

    /**
     * Complete reveal transaction
     */
    private completeRevealTx() {
        if (!this.inscriptionTxCtxData) {
            throw new Error("Inscription context data not initialized");
        }

        const ops = bitcoin.script.OPS;
        
        // Sign the single reveal transaction with multiple inputs
        if (this.revealTxs.length > 0) {
            const revealTx = this.revealTxs[0];
            
            // First loop: set input hashes (like inscribeFile.ts)
            revealTx.ins.forEach((input, i) => {
                input.hash = this.commitTx.getHash();
            });

            // Second loop: build scripts (like inscribeFile.ts)
            revealTx.ins.forEach((input, i) => {
                const chunk = this.inscriptionTxCtxData!.chunks[i];
                this.revealTxPrevOutputFetcher.push(this.inscriptionTxCtxData!.revealTxPrevOutput.value);

                // Create signature
                const privateKeyHex = base.toHex(this.inscriptionTxCtxData!.privateKey);
                const hash = revealTx.hashForSignature(i, chunk.inscriptionScript, bitcoin.Transaction.SIGHASH_ALL)!;
                const signature = sign(hash, privateKeyHex);

                // Build final script (exactly like inscribeFile.ts)
                const inscriptionBuilder: bitcoin.payments.StackElement[] = [];
                inscriptionBuilder.push(ops.OP_10);

                // Add data (same logic as inscribeFile.ts)
                const imageData = chunk.data;
                if (imageData.length > 450) {
                    for (let k = 450; k < imageData.length; k += 450) {
                        let data1: Buffer;
                        if (k + 450 > imageData.length) {
                            data1 = imageData.slice(k, imageData.length);
                        } else {
                            data1 = imageData.slice(k, k + 450);
                        }
                        inscriptionBuilder.push(data1);
                    }
                }

                inscriptionBuilder.push(ops.OP_FALSE);
                inscriptionBuilder.push(bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL));
                inscriptionBuilder.push(chunk.inscriptionScript);

                const finalScript = bitcoin.script.compile(inscriptionBuilder);
                input.script = finalScript;
            });
        }
    }

    /**
     * Calculate fees
     */
    calculateFee() {
        let commitTxFee = 0;
        this.commitTx.ins.forEach((_, i) => {
            commitTxFee += this.commitTxPrevOutputFetcher[i];
        });
        this.commitTx.outs.forEach(out => {
            commitTxFee -= out.value;
        });

        // Calculate reveal transaction fees (array with single fee)
        let revealTxFees: number[] = [];
        if (this.revealTxs.length > 0) {
            let totalRevealFee = 0;
            this.revealTxPrevOutputFetcher.forEach(fee => {
                totalRevealFee += fee;
            });
            totalRevealFee -= this.revealTxs[0].outs[0].value;
            revealTxFees.push(totalRevealFee);
        }

        return {
            commitTxFee,
            revealTxFees,
        };
    }

    /**
     * Update progress
     */
    private updateProgress(stage: string, current: number, total: number, message: string) {
        if (this.progressCallback) {
            this.progressCallback({
                stage: stage as any,
                current,
                total,
                percentage: total > 0 ? (current / total) * 100 : 0,
                message
            });
        }
    }

    /**
     * Get file information
     */
    getFileInfo() {
        if (!this.inscriptionTxCtxData) {
            return null;
        }

        return {
            totalChunks: this.inscriptionTxCtxData.totalChunks,
            totalSize: this.inscriptionTxCtxData.totalSize,
            chunkSize: BINARY_DATA_CONFIG.MAX_CHUNK_SIZE,
            chunks: this.inscriptionTxCtxData.chunks.map(chunk => ({
                index: chunk.index,
                size: chunk.size,
                address: chunk.address
            }))
        };
    }
}

// Return type for inscription
export type BinaryInscribeTxs = {
    commitTx: string;
    commitTxHash: string;
    revealTxs: string[];  // Array with single reveal transaction
    commitTxFee: number;
    revealTxFees: number[];  // Array with single reveal fee
    commitAddrs: string[];
    revealTxHash: string;
    fileInfo?: any;
    insufficient: boolean;
};


export function inscribeBinaryData(
    network: bitcoin.Network, 
    request: BinaryDataInscriptionRequest,
    progressCallback?: ProgressCallback
): BinaryInscribeTxs {
    const tool = BinaryDataInscriptionTool.newBinaryDataInscriptionTool(network, request, progressCallback);
    
    if (tool.mustCommitTxFee > 0) {
        return {
            commitTx: "",
            commitTxHash: "",
            revealTxs: [],
            commitTxFee: tool.mustCommitTxFee,
            revealTxFees: tool.mustRevealTxFees,
            commitAddrs: tool.commitAddrs,
            revealTxHash: "",
            fileInfo: tool.getFileInfo(),
            insufficient: true
        };
    }

    const hash = tool.revealTxs[0].getHash();
    const hexString = Buffer.from(hash).reverse().toString('hex');

    return {
        commitTx: tool.commitTx.toHex(),
        commitTxHash: hexString,
        revealTxs: tool.revealTxs.map(revealTx => revealTx.toHex()),
        revealTxHash: hexString,
        ...tool.calculateFee(),
        commitAddrs: tool.commitAddrs,
        fileInfo: tool.getFileInfo(),
        insufficient: false
    };
}



/**
 * Sign transaction function (reuse existing logic)
 */
function signTx(tx: bitcoin.Transaction, commitTxPrevOutputList: PrevOutput[], network: bitcoin.Network) {
    tx.ins.forEach((input, i) => {
        const addressType = getAddressType(commitTxPrevOutputList[i].address, network);
        const privateKey = base.fromHex(privateKeyFromWIF(commitTxPrevOutputList[i].privateKey, network));
        const privateKeyHex = base.toHex(privateKey);
        const publicKey = private2public(privateKeyHex);
        if (addressType === 'legacy') {
            const prevScript = bitcoin.address.toOutputScript(commitTxPrevOutputList[i].address, network);
            const hash = tx.hashForSignature(i, prevScript, bitcoin.Transaction.SIGHASH_ALL)!;
            const signature = sign(hash, privateKeyHex);
            const payment = bitcoin.payments.p2pkh({
                signature: bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL),
                pubkey: publicKey,
            });
            input.script = payment.input!;
        } else {
            throw 'unsupport address type'
        }
    });
} 