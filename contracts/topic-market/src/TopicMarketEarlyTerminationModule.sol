// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {IEarlyTerminationModule} from "ocp/interfaces/IEarlyTerminationModule.sol";
import {IOCPCore} from "ocp/interfaces/IOCPCore.sol";

interface IEarlyTerminationCore {
    function factory() external view returns (address);
    function originalResolutionTime() external view returns (uint256);
    function totalPrincipal() external view returns (uint256);
    function resolved() external view returns (bool);
}

/// @notice One non-upgradeable clone per Core; owns only proposal rules and lifecycle state.
/// @dev No token approvals/transfers and no authority to select a final result or modify Core votes.
contract TopicMarketEarlyTerminationModule is IEarlyTerminationModule {
    bool public initialized;
    address public override core;
    uint256 public override bondAmount;
    uint256 public override proposalCount;
    IOCPCore.EarlyTerminationRequest private _pending;

    event ModuleInitialized(address indexed core, uint256 bondAmount);
    event ProposalRecorded(uint256 indexed id, address indexed proposer, uint8 requestedOutcome,
        uint256 processAfter, uint256 bond, bytes32 reasonHash);
    event ProposalConsumed(uint256 indexed id);

    constructor() {
        // 实现合约自身不可初始化；EIP-1167 clone的独立storage从false开始。
        initialized = true;
    }

    modifier onlyCore() {
        require(msg.sender == core && core != address(0), "MODULE_ONLY_CORE");
        _;
    }

    function initialize(address core_, uint256 bondAmount_) external override {
        require(!initialized, "MODULE_INITIALIZED");
        require(core_ != address(0), "MODULE_CORE");
        // Adapter是Core.factory()，可在同一创建交易里clone+initialize+绑定。
        // 也兼容Core自身构造期间初始化：此时core_.code.length尚为0。
        require(msg.sender == core_ || (core_.code.length > 0
            && msg.sender == IEarlyTerminationCore(core_).factory()), "MODULE_INITIALIZER");
        initialized = true;
        core = core_;
        bondAmount = bondAmount_;
        emit ModuleInitialized(core_, bondAmount_);
    }

    function bondRequired() external view override returns(uint256) { return bondAmount; }

    function pending() external view override returns (IOCPCore.EarlyTerminationRequest memory) {
        return _pending;
    }

    function propose(address proposer, uint8 requestedOutcome, bytes32 reasonHash)
        external override onlyCore returns (IOCPCore.EarlyTerminationRequest memory request)
    {
        require(!IEarlyTerminationCore(core).resolved(), "Already finalized");
        require(proposer != address(0), "ACTOR");
        require(requestedOutcome == 1 || requestedOutcome == 2, "EARLY_OUTCOME");
        require(reasonHash != bytes32(0), "Missing reason");
        require(_pending.id == 0, "EARLY_PENDING");
        require(IEarlyTerminationCore(core).totalPrincipal() > 0, "NO_PRINCIPAL");
        uint256 deadline = IEarlyTerminationCore(core).originalResolutionTime();
        require(block.timestamp < deadline, "EARLY_DEADLINE");
        require(deadline - block.timestamp > 1 hours, "EARLY_WINDOW");
        require(bondAmount > 0, "EARLY_BOND_UNCONFIGURED");
        request = IOCPCore.EarlyTerminationRequest(++proposalCount, proposer, requestedOutcome,
            block.timestamp, block.timestamp + 1 hours, bondAmount, reasonHash);
        _pending = request;
        // Core随后才原子拉取保证金；转账失败会同时回滚本模块的记录与count。
        emit ProposalRecorded(request.id, proposer, requestedOutcome, request.processAfter,
            bondAmount, reasonHash);
    }

    function consume() external override onlyCore returns (IOCPCore.EarlyTerminationRequest memory request) {
        request = _pending;
        require(request.id != 0, "NO_EARLY_REQUEST");
        require(block.timestamp >= request.processAfter, "EARLY_PENDING_WINDOW");
        delete _pending;
        emit ProposalConsumed(request.id);
    }
}
