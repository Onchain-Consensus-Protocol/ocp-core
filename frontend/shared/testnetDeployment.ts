export const LEGACY_TESTNET_FACTORY='0xB5C08A89F11D18A62361b87Dc963379281CA6D82';
export const CURRENT_TESTNET_FACTORY='0xCef7fCb7e4B3d5A273A9e5c6D84C2886cE93C3Aa';
const legacyMarket='0xbe0d01292df5cef376a40be7433c9b5b0c398857';
export function resolveTestnetFactory(configured:string,search:string):string {
 const params=new URLSearchParams(search);
 if(params.get('deployment')==='legacy'||params.get('market')?.toLowerCase()===legacyMarket)return LEGACY_TESTNET_FACTORY;
 return configured&&configured.toLowerCase()!==LEGACY_TESTNET_FACTORY.toLowerCase()?configured:CURRENT_TESTNET_FACTORY;
}
