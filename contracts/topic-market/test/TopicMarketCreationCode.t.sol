// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {Test} from "forge-std/Test.sol";
import {TopicMarketCreationCode} from "../src/deployers/TopicMarketCreationCode.sol";
import {TopicMarketCoreDeployer} from "../src/deployers/TopicMarketCoreDeployer.sol";
import {TopicMarketDeployer} from "../src/deployers/TopicMarketDeployer.sol";
import {IToken6,ITopicMarketCore} from "../src/TopicMarket.sol";
import {VaultCoreAdapter} from "../src/VaultCoreAdapter.sol";

/// @dev Exposes the internal library only inside this test fixture, never in production.
contract CreationCodeHarness {
    function store(bytes memory payload) external returns(address,address,uint256,uint256){return TopicMarketCreationCode.store(payload);}
    function read(address a,address b,uint256 x,uint256 y) external view returns(bytes memory){return TopicMarketCreationCode.read(a,b,x,y);}
    function deploy(address a,address b,uint256 x,uint256 y,bytes memory args) external returns(address){return TopicMarketCreationCode.deploy(a,b,x,y,args);}
}
contract CreationCodeProbe {
    address public immutable creator;
    bytes32 public immutable value;
    constructor(bytes32 value_){creator=msg.sender;value=value_;}
}
contract TopicMarketCreationCodeTest is Test {
    function testChunkBoundaryReadbackPreservesExactBytesAndStopPrefix() public {
        CreationCodeHarness helper=new CreationCodeHarness();
        uint256[10] memory sizes=[uint256(0),1,31,32,33,23999,24000,24001,47999,48000];
        for(uint256 n;n<sizes.length;n++){
            uint256 size=sizes[n];bytes memory payload=new bytes(size);
            // Fill full allocated words, including padding; each stored runtime must omit padding.
            for(uint256 i;i<size;i+=32){bytes32 word=keccak256(abi.encode(size,i));assembly {mstore(add(add(payload,32),i),word)}}
            (address a,address b,uint256 x,uint256 y)=helper.store(payload);
            assertEq(x,size>24000?24000:size);assertEq(x+y,size);
            assertEq(a.code.length,x+1);assertEq(b.code.length,y+1);
            assertLe(a.code.length,24576);assertLe(b.code.length,24576);
            assertEq(uint256(uint8(a.code[0])),0);assertEq(uint256(uint8(b.code[0])),0);
            assertEq(keccak256(helper.read(a,b,x,y)),keccak256(payload));
        }
    }
    function testRejectsCreationPayloadBeyondTwoChunks() public {
        CreationCodeHarness helper=new CreationCodeHarness();
        vm.expectRevert(bytes("INITCODE_SIZE"));helper.store(new bytes(48001));
    }
    function testInternalCreatePreservesConstructorArgumentsAndCaller() public {
        CreationCodeHarness helper=new CreationCodeHarness();
        (address a,address b,uint256 x,uint256 y)=helper.store(type(CreationCodeProbe).creationCode);
        bytes32 value=keccak256("constructor argument");
        CreationCodeProbe probe=CreationCodeProbe(helper.deploy(a,b,x,y,abi.encode(value)));
        assertEq(probe.value(),value);assertEq(probe.creator(),address(helper));
    }
    function testDeployerAuthorizationIsStillImmutableFactoryOnly() public {
        TopicMarketDeployer marketDeployer=new TopicMarketDeployer(address(0xFA));
        TopicMarketCoreDeployer coreDeployer=new TopicMarketCoreDeployer(address(0xFA));
        vm.expectRevert(bytes("ONLY_FACTORY"));marketDeployer.deploy(IToken6(address(1)),ITopicMarketCore(address(2)),address(3),address(4),uint64(block.timestamp+6 hours),1e6,1e18);
        vm.expectRevert(bytes("ONLY_FACTORY"));coreDeployer.deploy(IToken6(address(1)),address(3),address(4),uint64(block.timestamp+6 hours),500e6);
        vm.expectRevert(bytes("ONLY_FACTORY"));coreDeployer.configureCore(VaultCoreAdapter(address(1)),address(2));
        vm.expectRevert(bytes("ONLY_FACTORY"));coreDeployer.bindCore(VaultCoreAdapter(address(1)),address(2));
    }
    function testBothCarriersRejectZeroFactory() public {
        vm.expectRevert(bytes("FACTORY"));new TopicMarketDeployer(address(0));
        vm.expectRevert(bytes("FACTORY"));new TopicMarketCoreDeployer(address(0));
    }
}
