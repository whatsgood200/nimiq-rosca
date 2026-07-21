// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// Test-only stand-in for USDT — OpenZeppelin's npm package doesn't ship
/// mocks, so this exists purely to mint test tokens in RoscaCircle.ts.
contract MockERC20 is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    /// Real USDT uses 6 decimals, not the ERC20 default of 18 — match it so
    /// frontend amount formatting is meaningful against this mock.
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
