import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
AWS.config.update({region:'us-east-1'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();

export async function get_image_urls(things){
    var string1="https://api.opensea.io/api/v1/assets?";
    for(var i=0;i<things.length;i++){
        const get_back = {
            TableName: "NFT_image_urls",
            Key: {
                tokenaddress: things[i]["token_address"],
                tokenid: things[i]["token_id"],        },
        };
        const response_body = await dynamoDb.get(get_back).promise();
        if(response_body!=null && response_body.Item!=null){
            console.log("Link present in table.");
            things[i]["image_url"]=response_body.Item["image_url"];
            continue;
        }
        else{
            var url_complete=string1.concat("token_ids=",things[i]["token_id"],"&asset_contract_addresses=",things[i]["token_address"]);
            string1="https://api.opensea.io/api/v1/assets?";
            console.log(url_complete);
            var ans =null;
            try{
                ans = await fetch(url_complete, {
                    method: 'get',
                    headers: {
                        'X-API-KEY': 'c436e16c9a3c4ee0a30534cb02a2f72c',
                    }
                }).then(response=>{return response.json();});
            }
            catch(e){
                console.log(e);
                console.log("Hence setting this link value to null");
                ans=null;
                continue;
            }
            //console.log(ans);
            if(ans!=null && ans["assets"]!=null && ans["assets"].length>0){
                things[i]["image_url"]=ans["assets"][0]["image_url"];
                const put_in={
                    TableName: "NFT_image_urls",
                    Item:{
                        tokenaddress : things[i]["token_address"],
                        tokenid: things[i]["token_id"],
                        image_url: things[i]["image_url"]
                    }
                }
                await dynamoDb.put(put_in).promise();
            }
        }
    }
    return things;
}

export async function get_inventory(dict,inventory_NFTs,current_inventory_list=null,ispolygon=false){
    var things=[];
    for(var i=0;i<inventory_NFTs.length;i++){
        var acq_price=0;
        var NFTstring=inventory_NFTs[i]["token_address"].concat(inventory_NFTs[i]["token_id"]);
        if(dict[NFTstring]!=null){
            acq_price=dict[NFTstring];
        }
        var token_address=inventory_NFTs[i]["token_address"];
        var token_id=inventory_NFTs[i]["token_id"];
        var acq_timestamp=inventory_NFTs[i]["synced_at"];
        var image_url=null;
        if(ispolygon==true){
            const obj=JSON.parse(inventory_NFTs[i]["metadata"]);
            if(obj!=null && obj["image"]!=null){
                image_url=obj["image"];
                console.log(image_url);
            }
        }
        var collection_name=inventory_NFTs[i]["name"];
        var estimated_price=0;
        var floor_price=0;
        var obj={
            token_address: token_address,
            token_id: token_id,
            acq_price: acq_price,
            acq_timestamp: acq_timestamp,
            image_url: image_url,
            collection_name: collection_name,
            estimated_price: estimated_price,
            floor_price: floor_price
        }
        things.push(obj);
    }
    if(ispolygon==false) things=await get_image_urls(things);
    return things;
}