// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// A trustless rotating savings circle (ROSCA). N members join (in the order
/// they join), each pays a fixed contribution every round, and once all N
/// have paid, the round's pot goes to that round's member (by join order).
/// No admin/owner role and no privileged withdraw path — nobody has to trust
/// an organizer, including whoever deployed this.
contract RoscaCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public immutable contributionAmount;
    uint256 public immutable memberCount;
    uint256 public immutable roundDuration;

    address[] public members;
    mapping(address => bool) public isMember;
    mapping(uint256 => mapping(address => bool)) public hasContributed;

    uint256 public currentRound;
    uint256 public roundDeadline;
    bool public locked;
    bool public completed;

    event Joined(address indexed member, uint256 index);
    event Contributed(address indexed member, uint256 indexed round, uint256 amount);
    event RoundPaidOut(uint256 indexed round, address indexed recipient, uint256 amount);
    event Refunded(address indexed member, uint256 indexed round, uint256 amount);
    event CircleCompleted();

    constructor(
        address _token,
        uint256 _contributionAmount,
        uint256 _memberCount,
        uint256 _roundDuration
    ) {
        require(_token != address(0), "token required");
        require(_contributionAmount > 0, "contribution must be positive");
        require(_memberCount >= 2, "need at least 2 members");
        require(_roundDuration > 0, "round duration must be positive");

        token = IERC20(_token);
        contributionAmount = _contributionAmount;
        memberCount = _memberCount;
        roundDuration = _roundDuration;
    }

    /// Number of members who have actually joined so far — distinct from
    /// `memberCount`, the target/cap. `members(i)` reverts for i >= this.
    function joinedCount() external view returns (uint256) {
        return members.length;
    }

    function join() external {
        require(!locked, "circle is full");
        require(!isMember[msg.sender], "already joined");

        isMember[msg.sender] = true;
        members.push(msg.sender);
        emit Joined(msg.sender, members.length - 1);

        if (members.length == memberCount) {
            locked = true;
            roundDeadline = block.timestamp + roundDuration;
        }
    }

    function contribute() external nonReentrant {
        require(locked, "circle not full yet");
        require(!completed, "circle completed");
        require(isMember[msg.sender], "not a member");
        require(!hasContributed[currentRound][msg.sender], "already contributed this round");
        require(block.timestamp <= roundDeadline, "round deadline passed, use refund");

        hasContributed[currentRound][msg.sender] = true;
        emit Contributed(msg.sender, currentRound, contributionAmount);

        token.safeTransferFrom(msg.sender, address(this), contributionAmount);

        if (_allContributed(currentRound)) {
            _payout();
        }
    }

    /// The stall escape hatch: if a round's deadline passes without every
    /// member paying, whoever did pay can reclaim their own contribution.
    /// The round does not auto-resume after this — a non-paying member
    /// breaks this cycle, same as in an informal ROSCA.
    function refund() external nonReentrant {
        require(locked, "circle not full yet");
        require(!completed, "circle completed");
        require(block.timestamp > roundDeadline, "round deadline has not passed yet");
        require(hasContributed[currentRound][msg.sender], "nothing to refund");

        hasContributed[currentRound][msg.sender] = false;
        emit Refunded(msg.sender, currentRound, contributionAmount);

        token.safeTransfer(msg.sender, contributionAmount);
    }

    function _allContributed(uint256 round) internal view returns (bool) {
        uint256 count = members.length;
        for (uint256 i = 0; i < count; i++) {
            if (!hasContributed[round][members[i]]) {
                return false;
            }
        }
        return true;
    }

    function _payout() internal {
        address recipient = members[currentRound];
        uint256 potAmount = contributionAmount * memberCount;

        emit RoundPaidOut(currentRound, recipient, potAmount);
        currentRound++;

        if (currentRound == memberCount) {
            completed = true;
            emit CircleCompleted();
        } else {
            roundDeadline = block.timestamp + roundDuration;
        }

        token.safeTransfer(recipient, potAmount);
    }
}
