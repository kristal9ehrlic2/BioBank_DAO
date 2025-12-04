pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract BioBank_DAO_FHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Batch {
        uint256 id;
        bool active;
        uint256 dataCount;
    }
    uint256 public currentBatchId;
    mapping(uint256 => Batch) public batches;

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event DataSubmitted(address indexed provider, uint256 indexed batchId, uint256 encryptedValue);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 result);

    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchNotActive();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier respectCooldown(address user, mapping(address => uint256) storage accessTime, uint256 cooldown) {
        if (block.timestamp < accessTime[user] + cooldown) {
            revert CooldownActive();
        }
        accessTime[user] = block.timestamp;
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60;
        currentBatchId = 1;
        _openBatch(currentBatchId);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner {
        currentBatchId++;
        _openBatch(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner {
        Batch storage batch = batches[batchId];
        if (batch.id == 0 || !batch.active) revert InvalidBatch();
        batch.active = false;
        emit BatchClosed(batchId);
    }

    function submitData(uint256 batchId, uint256 value) external payable onlyProvider whenNotPaused respectCooldown(msg.sender, lastSubmissionTime, cooldownSeconds) {
        Batch storage batch = batches[batchId];
        if (batch.id == 0 || !batch.active) revert BatchNotActive();

        euint32 memory encryptedValue = FHE.asEuint32(value);
        _initIfNeeded(encryptedValue);

        batch.dataCount++;
        emit DataSubmitted(msg.sender, batchId, encryptedValue);
    }

    function requestAggregatedDataDecryption(uint256 batchId) external respectCooldown(msg.sender, lastDecryptionRequestTime, cooldownSeconds) {
        Batch storage batch = batches[batchId];
        if (batch.id == 0 || batch.dataCount == 0) revert InvalidBatch();

        euint32 memory sum = FHE.asEuint32(0);
        _initIfNeeded(sum);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(sum);

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        Batch storage batch = batches[decryptionContexts[requestId].batchId];
        if (batch.id == 0) revert InvalidBatch();

        euint32 memory sum = FHE.asEuint32(0);
        _initIfNeeded(sum);
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(sum);

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) {
            revert InvalidProof();
        }

        uint256 result = abi.decode(cleartexts, (uint256));
        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, decryptionContexts[requestId].batchId, result);
    }

    function _openBatch(uint256 batchId) private {
        batches[batchId] = Batch({ id: batchId, active: true, dataCount: 0 });
        emit BatchOpened(batchId);
    }

    function _hashCiphertexts(bytes32[] memory cts) private view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 s) private view {
        if (!FHE.isInitialized(s)) revert NotInitialized();
    }

    function _initIfNeeded(ebool b) private view {
        if (!FHE.isInitialized(b)) revert NotInitialized();
    }
}