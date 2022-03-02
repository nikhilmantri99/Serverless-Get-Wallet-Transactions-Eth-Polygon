import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
const dynamoDb = new AWS.DynamoDB.DocumentClient();
AWS.config.update({region:'us-east-1'});

async function find_conversion_rate(ticker1,ticker2,timeline){ // gets price of ticker 1 in terms of ticker 2
    if((ticker1=="ETH" && ticker2=="WETH") || (ticker1=="WETH" && ticker2=="ETH") || ticker1==ticker2){
        return 1;
    }
    //https://api.covalenthq.com/v1/pricing/historical/eth/revv/
    //?quote-currency=USD&format=JSON&from=2021-12-31&to=2021-12-31&key=ckey_c4b9331412914d59845089270d0
    const part1="https://api.covalenthq.com/v1/pricing/historical/";
    const part2=ticker2;
    const part3="/";
    const part4=ticker1;
    const part5="/?quote-currency=USD&format=JSON&from=";
    const part6=timeline.slice(0,10);
    const part7="&to=";
    const part8=part6;
    const part9="&key=ckey_c4b9331412914d59845089270d0";
    const url_complete=part1.concat(part2,part3,part4,part5,part6,part7,part8,part9);
    const ans = await fetch(url_complete).then(response=>{return response.json();});
    //console.log(url_complete);
    //console.log(ans);
    if(ans==null || ans["data"]==null || ans["data"]["prices"]==null || ans["data"]["prices"].length==0 || ans["data"]["prices"][0]["price"]==null) return 0;
    else{
       return ans["data"]["prices"][0]["price"];
    }
}

async function covalent_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name){
    //console.log(txn_hash);
    let chain_num;
    if(chain_name=='polygon'){
        chain_num="137";
    }
    else{
        chain_num="1";
    }
    const e1='https://api.covalenthq.com/v1/';
    const e2='/transaction_v2/';
    const part1=e1.concat(chain_num,e2);
    const part2=txn_hash;
    const part3='/?&key=';
    const part4='ckey_c4b9331412914d59845089270d';
    const url_complete=part1.concat(part2,part3,part4);
    const ans = await fetch(url_complete).then(response=>{return response.json();});
    let mainmoney=0,comission=0,i=0;
    let rate_matic2eth=1;
    let gas_price=0;
    let count_occurence=0;
    let count_occurence2=0;
    let nft_count=0;
    if(ans["data"]!=null && ans["data"]["items"]!=null){
        if(ans["data"]["updated_at"]!=null) rate_matic2eth=await find_conversion_rate("MATIC","ETH",ans["data"]["updated_at"]);
    }
    gas_price=parseInt(ans["data"]["items"][0]["gas_price"])/(10**18);
    if(chain_name=="polygon"){
        gas_price=rate_matic2eth*gas_price;
    }
    if(ans["data"]!=null && ans["data"]["items"]!=null){
        for(i=0;i<ans["data"]["items"][0]["log_events"].length;i++){
            if( ans["data"]["items"][0]["log_events"][i]["decoded"]!=null
                && ans["data"]["items"][0]["log_events"][i]["sender_contract_decimals"]==0
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["name"]=="Transfer"
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["params"]!=null
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][1]["value"]==NFTto){
                    nft_count++;
                }
        }
    }
    if(ans["data"]!=null && ans["data"]["items"]!=null){
        for(i=0;i<ans["data"]["items"][0]["log_events"].length;i++){
            if( ans["data"]["items"][0]["log_events"][i]["decoded"]!=null
                && ans["data"]["items"][0]["log_events"][i]["sender_contract_decimals"]==18
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["name"]=="Transfer"
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["params"]!=null
                && ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][2]["value"]!=null){
                const rate= await find_conversion_rate(ans["data"]["items"][0]["log_events"][i]["sender_contract_ticker_symbol"],
                    "ETH",ans["data"]["items"][0]["log_events"][i]["block_signed_at"]);
                //console.log("Conversion Rate: ",rate," of 1 ",ans.data.items[0].log_events[i].sender_contract_ticker_symbol," to ETH");
                if(ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][1]["value"]==NFTfrom){
                    count_occurence++;
                    mainmoney+=rate*parseInt(ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][2]["value"])/(10**18);
                    if(i+1<ans["data"]["items"][0]["log_events"].length){
                        if(ans["data"]["items"][0]["log_events"][i+1]["decoded"]!=null
                            && ans["data"]["items"][0]["log_events"][i+1]["sender_contract_decimals"]==18
                            && ans["data"]["items"][0]["log_events"][i+1]["decoded"]["name"]=="Transfer"
                            && ans["data"]["items"][0]["log_events"][i+1]["decoded"]["params"][2]["value"]!=null){
                                comission+=rate*parseInt(ans["data"]["items"][0]["log_events"][i+1]["decoded"]["params"][2]["value"])/(10**18);
                        }
                    }
                }
                else if(ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][0]["value"]==NFTfrom && NFTfrom!=NFTto){
                    count_occurence2++
                    mainmoney-=rate*parseInt(ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][2]["value"])/(10**18);
                    comission+=rate*parseInt(ans["data"]["items"][0]["log_events"][i]["decoded"]["params"][2]["value"])/(10**18);
                }
            }
        }
    }
    if(mainmoney==0 && comission==0) return [null,gas_price,nft_count];
    else if(count_occurence>1) return [[mainmoney/count_occurence,comission/count_occurence,"ETH"],gas_price,nft_count];
    else if(count_occurence2>1) return [[mainmoney/count_occurence2,comission/count_occurence2,"ETH"],gas_price,nft_count];
    else if(nft_count>1) return [[mainmoney/nft_count,comission/nft_count,"ETH"],gas_price,nft_count];
    else return [[mainmoney,comission,"ETH"],gas_price,nft_count];
}

async function etherscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count){
    const part1= 'https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=';
    const part2=txn_hash;
    const part3='&apikey=';
    const part4='3K72Z6I2T121TAQZ9DY34EF6F9NADKAH87';
    const url_complete=part1.concat(part2,part3,part4);
    const ans = await fetch(url_complete).then(response=>{return response.json();});
    let mainmoney=0,commission=0;
    let count_occurence=0;//useful for bundle
    let count_occurence2=0;
    for(let i=0;i<ans["result"].length;i++){
        if(ans["result"][i]["value"]!=null){
            if(ans["result"][i]["to"]==NFTfrom){
                mainmoney+=parseInt(ans["result"][i]["value"])/(10**18);
                count_occurence++;
                if(i-1>=0){
                    commission+=parseInt(ans["result"][i-1]["value"])/(10**18);
                }
            }
            else if(ans["result"][i]["from"]==NFTfrom && NFTfrom!=NFTto){
                count_occurence2++;
                mainmoney-=parseInt(ans["result"][i]["value"])/(10**18);
                commission+=parseInt(ans["result"][i]["value"])/(10**18);
            }
        }
    }
    if(mainmoney==0 && commission==0){
        return null;
    }
    else{
        if(count_occurence>1) return [mainmoney/count_occurence,commission/count_occurence,"ETH"];
        else if(count_occurence2>1) return [mainmoney/count_occurence2,commission/count_occurence2,"ETH"];
        else if(nft_count>1) return [mainmoney/nft_count,commission/nft_count,"ETH"];
        else return [mainmoney,commission,"ETH"];
    }
}

async function polygonscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count){
    const part1= 'https://api.polygonscan.com/api?module=account&action=txlistinternal&txhash=';
    const part2=txn_hash;
    const part3='&apikey=';
    const part4='KSPP4UMVPIGFV24FEA19RGND8XN9V3D3C3';
    const url_complete=part1.concat(part2,part3,part4);
    //console.log(url_complete);
    const ans = await fetch(url_complete).then(response=>{return response.json();});
    //console.log(ans);
    let mainmoney=0,commission=0;
    let count_occurence=0;//useful for bundle
    let count_occurence2=0;
    for(let i=0;i<ans["result"].length;i++){
        if(ans["result"][i]["value"]!=null){
            if(ans["result"][i]["to"]==NFTfrom){
                mainmoney+=parseInt(ans["result"][i]["value"])/(10**18);
                count_occurence++;
                if(i-1>=0){
                    commission+=parseInt(ans["result"][i-1]["value"])/(10**18);
                }
            }
            else if(ans["result"][i]["from"]==NFTfrom && NFTfrom!=NFTto){
                count_occurence2++;
                mainmoney-=parseInt(ans["result"][i]["value"])/(10**18);
                commission+=parseInt(ans["result"][i]["value"])/(10**18);
            }
        }
    }
    if(count_occurence>1) return [mainmoney/count_occurence,commission/count_occurence,"MATIC"];
    else if(count_occurence2>1) return [mainmoney/count_occurence2,commission/count_occurence2,"MATIC"];
    else if(nft_count>1) return [mainmoney/nft_count,commission/nft_count,"MATIC"];
    else return [mainmoney,commission,"MATIC"];
}


async function value_from_hash(txn_hash,waddress,NFTfrom,NFTto,chain_name){
    const ans11= await covalent_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name);
    if(ans11==[-1]){
        return -1;
    }
    const ans1=ans11[0];
    const gas_price=ans11[1];
    const nft_count=ans11[2];
    if(ans1==null && chain_name=="eth"){
        const ans2= await etherscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count);
        return [ans2,gas_price,nft_count];
    }
    else if(ans1==null && chain_name=="polygon"){
        const ans2= await polygonscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count);
        return [ans2,gas_price,nft_count];
    }
    else{
        return [ans1,gas_price,nft_count];
    }
}

async function get_image_urls(things){
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
            const ans = await fetch(url_complete, {
                method: 'get',
                headers: {
                    'X-API-KEY': 'c436e16c9a3c4ee0a30534cb02a2f72c',
                }
            }).then(response=>{return response.json();});
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

async function get_inventory(dict,inventory_NFTs,current_inventory_list=null,ispolygon=false){
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

async function get_metrics(ls,isoverall=false,inventory_NFTs=null,current_inventory_list=null,ispolygon=false){ //ls: list of transactions
    var revenue=0;
    var spending=0;
    var ROI=0;
    var inventory_value=0;
    for(var i=0;i<ls.length;i++){
        if(ls[i]["activity"]=="Bought"){
            spending+=ls[i]["net_value"];
        }
        else{
            revenue+=ls[i]["net_value"];
        }
    }
    var investment=0;
    var returns=0;
    var dict={};
    for(var i=ls.length-1;i>=0;i--){
        var NFTstring=ls[i]["tokenaddress"].concat(ls[i]["tokenid"]);
        if (ls[i]["activity"]=="Bought"){
            dict[NFTstring]=ls[i]["net_value"];
        }
        else if(dict[NFTstring]!=null && ls[i]["activity"]=="Sold"){
            investment+=dict[NFTstring];
            returns+=ls[i]["net_value"];
            delete dict[NFTstring];
        }
        else{
            delete dict[NFTstring];
        }
    }
    if(investment!=0) {
        ROI=(returns-investment)*100/investment;
    }
    var i=0;
    for(var key in dict){
        i++;
        inventory_value+=dict[key];
    }
    const return_val= {
        revenue : revenue,
        spending : spending,
        ROI : ROI,
        inventory_value: inventory_value
    }
    var ans;
    if(isoverall==true && inventory_NFTs!=null){
        console.log("Total NFTs in inventory from txns:",i);
        ans=await get_inventory(dict,inventory_NFTs,current_inventory_list,ispolygon);
        return [return_val,ans];
    }
    return return_val;
}

async function get_metrics_token_wise(ls,inventory_NFTs=null,curr_inventory_list=null,ispolygon=false){
    var dict={};
    for(var i=0;i<ls.length;i++){
        var token_address=ls[i]["tokenaddress"];
        if(dict[token_address]!=null){
            //console.log("in here we flyyyyy.....")
            dict[token_address].push(ls[i]);
        }
        else{
            //console.log("in here we go.....")
            dict[token_address]=[];
            dict[token_address].push(ls[i]);
        }
    }
    var token_wise_metrics={};
    console.log("Important metrics, tokenwise, are as follows:")
    for(var key in dict){
        token_wise_metrics[key]=await get_metrics(dict[key]);
        //console.log(key,token_wise_metrics[key]);
    }
    var finale=await get_metrics(ls,true,inventory_NFTs,curr_inventory_list,ispolygon);
    token_wise_metrics["overall_metrics"]=finale[0];
    var inventory_things=finale[1];
    console.log("overall_metrics",token_wise_metrics["overall_metrics"]);
    return [token_wise_metrics,inventory_things];
}

async function return_NFT_transactions(userid,chain_name,waddress,pg_num=1){
    var to_update=false;
    var curr_txn_list=[];
    var txns_skipped=0;
    var txns_processed=0;
    const get_back = {
        TableName: "lambda-wallet-chain-transactions",
        Key: {
            walletId: waddress,
            chainName: chain_name,        },
    };
    const newResult = await dynamoDb.get(get_back).promise();
    if(newResult!=null && newResult.Item!=null){
        to_update=true;
        curr_txn_list=curr_txn_list.concat(newResult.Item["transactions"]);
        console.log("exists in the table.");
        txns_skipped=newResult.Item["txns_skipped"];
        txns_processed=newResult.Item["txns_processed"];
    }
    var transcations_list=[];
    const serverUrl = "https://kpvcez1i2tg3.usemoralis.com:2053/server";
    const appId = "viZCI1CZimCj22ZTyFuXudn3g0wUnG2pELzPvdg6";
    Moralis.start({ serverUrl, appId });
    var all_transfers=[];
    console.log("fetching...");
    var transfersNFT = await Moralis.Web3API.account.getNFTTransfers({ chain: chain_name, address: waddress, limit: 1});
    var total_nft_transfers_required=transfersNFT.total-(txns_processed+txns_skipped);
    console.log("Required total NFT transfers: ",total_nft_transfers_required);
    if(total_nft_transfers_required>20){
        //let server_url= "http://localhost:3000/?wallet=";
        let server_url= "http://ec2-34-226-246-235.compute-1.amazonaws.com:3000/?wallet=";
        let part_wallet=waddress;
        let part2="&chain=";
        let part_chain=chain_name;
        let part3="&userid=";
        let part_userid=userid;
        server_url=server_url.concat(part_wallet,part2,part_chain,part3,part_userid);
        console.log(server_url);
        try{
            const ans = await fetch(server_url).then(response=>{return response.json();});
            return {
                statusCode : 200,
                body: JSON.stringify(ans,null,2),
            }
        }
        catch(e){
            return {
                statusCode : 500,
                body: JSON.stringify(e),
                solution: "Try again after sometime!",
            }
        }
    }
    var n=0;
    while(all_transfers.length<total_nft_transfers_required){
        console.log("Here");
        transfersNFT = await Moralis.Web3API.account.getNFTTransfers({ chain: chain_name, address: waddress, offset: n*500});
        var cap=500;
        if(total_nft_transfers_required-all_transfers.length<cap){
            cap=total_nft_transfers_required-all_transfers.length;
        }
        all_transfers=all_transfers.concat(transfersNFT.result.slice(0,cap));
        console.log(all_transfers.length);
        n++;
    }
    //console.log(total_nft_transfers_required,all_transfers.length);
    //console.log(all_transfers[0]);
    console.log("For wallet address:",waddress," ,chain: ",chain_name,"total transactions:",all_transfers.length,"\nFollowing are the NFT Transaction values: ");
    let count=0;
    for(let i=0;i<all_transfers.length;i++){
        //console.log("Hello");
        const value_from_moralis=parseInt(all_transfers[i]["value"])/(10**18);
        //console.log(transfersNFT.result[i].transaction_hash);
        const value_from_hash_scans_=await value_from_hash(all_transfers[i]["transaction_hash"],waddress,
        all_transfers[i]["from_address"],all_transfers[i]["to_address"],chain_name);
        //const value_from_hash_scans=null;
        const value_from_hash_scans=value_from_hash_scans_[0];
        let gas_price=value_from_hash_scans_[1];
        let nft_count=value_from_hash_scans_[2];
        if(gas_price==null) gas_price=0;
        if(value_from_hash_scans==-1){ //here we maybe skipping some transactions
            txns_skipped++;
            continue;
        }
        txns_processed++;
        //console.log(value_from_moralis,value_from_hash_scans);
        let final_value;
        if(value_from_hash_scans!=null){
            final_value=value_from_hash_scans;
            if(final_value[0]<0){
                let ticker1="ETH";
                if(chain_name=="polygon"){
                    ticker1="MATIC";
                }
                const rate=await find_conversion_rate(ticker1,final_value[2],all_transfers[i]["block_timestamp"]);
                final_value[0]+=rate*value_from_moralis;
            }
        }
        else if(chain_name=="polygon"){
            if(nft_count>0) final_value=[value_from_moralis/nft_count,0,"MATIC"];
            else final_value=[value_from_moralis,0,"MATIC"];
        }
        else{
            if(nft_count>0) final_value=[value_from_moralis/nft_count,0,"ETH"];
            else final_value=[value_from_moralis,0,"ETH"];
        }
        const rate=await find_conversion_rate(final_value[2],"ETH",all_transfers[i]["block_timestamp"]);
        final_value[0]=rate*final_value[0];
        final_value[1]=rate*final_value[1];
        final_value[2]="ETH";
        count++;
        let action;
        let net_value_;
        if(all_transfers[i]["from_address"]==waddress){
            action="Sold";
            net_value_=final_value[0];
            console.log(count,". Sold NFT. Revenue Increases. Value:",final_value[0],final_value[2],". Hash: ",all_transfers[i].transaction_hash);
        }
        else{
            action="Bought";
            net_value_=final_value[0]+final_value[1];
            console.log(count,". Bought NFT. Spending Increases. Value:",final_value[0]+final_value[1],final_value[2],". Hash: ",all_transfers[i].transaction_hash);
        }
        const this_transaction={
            userId :userid,
            walletId : waddress,
            blockchain_name: chain_name,
            old_NFT_owner: all_transfers[i].from_address,
            new_NFT_owner: all_transfers[i].to_address,
            transaction_hash: all_transfers[i].transaction_hash,
            transaction_timestamp: all_transfers[i].block_timestamp,
            tokenaddress : all_transfers[i].token_address,
            tokenid: all_transfers[i].token_id,
            activity: action,
            value: final_value[0],
            value_mp_fees: final_value[1],
            net_value: net_value_,
            gas_price: gas_price,
            currency_of_transaction: final_value[2],
        };
        transcations_list.push(this_transaction);
    }

    //update list by also adding existing txns from the table
    if(curr_txn_list.length!=0){
        transcations_list=transcations_list.concat(curr_txn_list);
    }

    const q={chain:chain_name,address: waddress};
    const inventory_NFTS=await Moralis.Web3API.account.getNFTs(q);
    console.log(inventory_NFTS.result);
    //console.log("NFTs in inventory using Moralis: ",inventory_NFTS.result.length);
    var metrics_;
    if(chain_name=="polygon"){
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result,null,true);
    }
    else{
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result);
    }
    const metrics=metrics_[0];
    const inventory_things=metrics_[1];
    var total_pages;
    if(transcations_list.length%50==0) total_pages= Math.floor(transcations_list.length/50);
    else total_pages= Math.floor(transcations_list.length/50)+1;
    const transactions={
        TableName: get_back.TableName,
        Item: {
            walletId :get_back.Key.walletId,
            chainName : get_back.Key.chainName,
            transactions: transcations_list,
            total_pages: total_pages,
            txns_skipped : txns_skipped,
            txns_processed : txns_processed,
            overall_metrics : metrics["overall_metrics"],
            token_wise_metrics: metrics,
            inventory_NFTS: inventory_things,
        }
    }
    try{
        await dynamoDb.put(transactions).promise();
        const response_body = await dynamoDb.get(get_back).promise();
        var total_len=response_body.Item["transactions"].length;
        if(pg_num>=total_pages) response_body.Item["transactions"]=response_body.Item["transactions"].slice((total_pages-1)*50,total_len);
        else response_body.Item["transactions"]=response_body.Item["transactions"].slice((pg_num-1)*50,pg_num*50);
        return {
            statusCode: 200,
            body: response_body,
        };
    }
    catch(e){
        console.log("Error is found....");
        console.log(e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message }),
        };
    }
}

//export async function handler(event, context){
export const hello = async (event, context)=>{
    const wallet = event["queryStringParameters"]['wallet'];
    //const wallet = "0x4958cde93218e9bbeaa922cd9f8b3feec1342772";
    if(wallet==null){
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "No wallet provided." }),
        };
    }
    let userId = event["queryStringParameters"]['userid'];
    //let userId = "1";
    if(userId==null){
        userId="1";
    }
    let chain_name= event["queryStringParameters"]['chain'];
    //let chain_name="eth";
    if(chain_name==null){
        chain_name="eth";
    }
    let pg_num=event["queryStringParameters"]['page_number'];
    if(pg_num==null){
        pg_num=1;
    }
    else{
        pg_num=parseInt(pg_num);
    }
    const ans= await return_NFT_transactions(userId,chain_name,wallet,pg_num);
    var sc=200;
    if(ans["statusCode"]!=null){
        sc=ans["statusCode"];
    }
    const response = {
        statusCode: sc,
        headers: {
            "my_header": "my_value"
        },
        body:JSON.stringify(ans,null,2),
        isBase64Encoded: false
    };
    return response;
};

