import Moralis from "moralis/node.js";
import fetch from "node-fetch";
import AWS from "aws-sdk";
AWS.config.update({region:'us-east-1'});
const dynamoDb = new AWS.DynamoDB.DocumentClient();
import {get_total_pages,put_txns,get_all_txns,get_page_txns,put_inventory,get_all_inventory,get_page_inventory,
    put_tokenwisemetrics,get_all_tokenwisemetrics,get_page_tokenwisemetrics,put_overall_metrics,get_overall_metrics} from "./dynamodb_utils";
import {get_image_urls,get_inventory} from './inventory_utils';
import {get_metrics_token_wise,get_metrics} from './metric_utils';


export async function fetch_from_url(url_,s=2){
    var response = await fetch(url_);
    if (response.status >= 200 && response.status <= 299) {
        var jsonResponse = await response.json();
        return jsonResponse;
    } else {
        console.log(1);
        await new Promise(resolve => setTimeout(resolve, s*1000)); // 3 sec
        console.log(2);
        response = await fetch(url_);
        var jsonResponse = await response.json();
        return jsonResponse;
    }
}

export async function find_conversion_rate(ticker1,ticker2,timeline){ // gets price of ticker 1 in terms of ticker 2
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
    const ans = await fetch_from_url(url_complete);
    //console.log(url_complete);
    //console.log(ans);
    if(ans==null || ans["data"]==null || ans["data"]["prices"]==null || ans["data"]["prices"].length==0 || ans["data"]["prices"][0]["price"]==null) return 0;
    else{
       return ans["data"]["prices"][0]["price"];
    }
}

export async function covalent_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name){
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
    const part4='ckey_c4b9331412914d59845089270d0';
    const url_complete=part1.concat(part2,part3,part4);
    const ans = await fetch_from_url(url_complete);
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

export async function etherscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count){
    const part1= 'https://api.etherscan.io/api?module=account&action=txlistinternal&txhash=';
    const part2=txn_hash;
    const part3='&apikey=';
    const part4='3K72Z6I2T121TAQZ9DY34EF6F9NADKAH87';
    const url_complete=part1.concat(part2,part3,part4);
    var ans = await fetch_from_url(url_complete,5);
    if (ans["result"]=="Max rate limit exceeded"){
        await new Promise(resolve => setTimeout(resolve, 5*1000)); // 3 sec
        ans = await fetch_from_url(url_complete,5);
    }
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

export async function polygonscan_logs(txn_hash,waddress,NFTfrom,NFTto,chain_name,nft_count){
    const part1= 'https://api.polygonscan.com/api?module=account&action=txlistinternal&txhash=';
    const part2=txn_hash;
    const part3='&apikey=';
    const part4='KSPP4UMVPIGFV24FEA19RGND8XN9V3D3C3';
    const url_complete=part1.concat(part2,part3,part4);
    //console.log(url_complete);
    var ans = await fetch_from_url(url_complete,5);
    if (ans["result"]=="Max rate limit exceeded"){
        await new Promise(resolve => setTimeout(resolve, 5*1000)); // 3 sec
        ans = await fetch_from_url(url_complete,5);
    }
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


export async function value_from_hash(txn_hash,waddress,NFTfrom,NFTto,chain_name){
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


export async function transaction_row(txn,waddress,chain_name,userid,txns_processed,txns_skipped,count){
    //console.log("Hello");
    var value_from_moralis=parseInt(txn["value"])/(10**18);
    if(value_from_moralis==null || isNaN(value_from_moralis)){
        value_from_moralis=0;
    }
    //console.log(transfersNFT.result[i].transaction_hash);
    const value_from_hash_scans_=await value_from_hash(txn["transaction_hash"],waddress,
    txn["from_address"],txn["to_address"],chain_name);
    //const value_from_hash_scans=null;
    const value_from_hash_scans=value_from_hash_scans_[0];
    let gas_price=value_from_hash_scans_[1];
    let nft_count=value_from_hash_scans_[2];
    if(gas_price==null) gas_price=0;
    if(value_from_hash_scans==-1){ //here we maybe skipping some transactions
        txns_skipped++;
        return [null,txns_processed,txns_skipped,count];
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
            const rate=await find_conversion_rate(ticker1,final_value[2],txn["block_timestamp"]);
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
    const rate=await find_conversion_rate(final_value[2],"ETH",txn["block_timestamp"]);
    final_value[0]=rate*final_value[0];
    final_value[1]=rate*final_value[1];
    final_value[2]="ETH";
    if(isNaN(final_value[0]) || final_value[0]==null){
        final_value[0]=0;
    }
    if(isNaN(final_value[1]) || final_value[1]==null){
        final_value[1]=0;
    }
    count++;
    let action;
    let net_value_;
    if(txn["from_address"]==waddress){
        action="Sold";
        net_value_=final_value[0];
        console.log(count,". Sold NFT. Revenue Increases. Value:",final_value[0],final_value[2],". Hash: ",txn.transaction_hash);
    }
    else{
        action="Bought";
        net_value_=final_value[0]+final_value[1];
        console.log(count,". Bought NFT. Spending Increases. Value:",final_value[0]+final_value[1],final_value[2],". Hash: ",txn.transaction_hash);
    }
    const this_transaction={
        userId :userid,
        walletId : waddress,
        blockchain_name: chain_name,
        old_NFT_owner: txn.from_address,
        new_NFT_owner: txn.to_address,
        transaction_hash: txn.transaction_hash,
        transaction_timestamp: txn.block_timestamp,
        tokenaddress : txn.token_address,
        tokenid: txn.token_id,
        activity: action,
        value: final_value[0],
        value_mp_fees: final_value[1],
        net_value: net_value_,
        gas_price: gas_price,
        currency_of_transaction: final_value[2],
    };
    return [this_transaction,txns_processed,txns_skipped,count];
}

export async function call_server(waddress,chain_name,userid,txn_page=1,inventory_page=1,token_page=1,local_server=false){
    let server_url= "http://ec2-34-226-246-235.compute-1.amazonaws.com:80/?wallet=";
    if(local_server==true){
        server_url="http://localhost:3000/?wallet=";
    }
    let part_wallet=waddress;
    let part2="&chain=";
    let part_chain=chain_name;
    let part3="&userid=";
    let part_userid=userid;
    let part4="&txn_page=";
    let part_txn_page=txn_page.toString();
    let part5="&inventory_page=";
    let part_inventory_page=inventory_page.toString();
    let part6="&token_page=";
    let part_token_page=token_page.toString();
    server_url=server_url.concat(part_wallet,part2,part_chain,part3,part_userid,
        part4,part_txn_page,part5,part_inventory_page,part6,part_token_page);
    console.log(server_url);
    try{
        const ans = await fetch(server_url).then(response=>{return response.json();});
        return {
            statusCode : 200,
            status : "Processing",
            body: JSON.stringify(ans,null,2),
        }
    }
    catch(e){
        return {
            statusCode : 500,
            body: JSON.stringify(e),
            status: "ERROR",
            solution: "Try again after sometime!",
        }
    }
}

export async function return_state(waddress,chain_name,txn_page=1,inventory_page=1,tokenwisemetric_page=1){
    var txn_ls=await get_page_txns(waddress,chain_name,txn_page);
    var inv_ls=await get_page_inventory(waddress,chain_name,inventory_page);
    var tokenwisemetric_ls=await get_page_tokenwisemetrics(waddress,chain_name,tokenwisemetric_page);
    var overall_metrics =await get_overall_metrics(waddress,chain_name);
    var obj={
        walletId :waddress,
        chainName : chain_name,
        overall_metrics: overall_metrics,
        transactions: txn_ls[0],
        total_txns_page: txn_ls[1],
        curr_txns_page:txn_ls[3],
        inventory: inv_ls[0],
        total_inventory_pages: inv_ls[1],
        curr_inventory_page: inv_ls[3],
        tokenwise_metrics: tokenwisemetric_ls[0],
        total_tokenwisemetric_pages: tokenwisemetric_ls[1],
        current_tokenwisemetric_page: tokenwisemetric_ls[3],
    }
    return obj;
}



export async function return_NFT_transactions(userid,chain_name,waddress,txn_page=1,inventory_page=1,tokenwisemetric_page=1){
    var to_update=false;
    var curr_txn_list=[];
    var txns_skipped=0;
    var txns_processed=0;
    const newResult = await get_page_txns(waddress,chain_name,1);
    if(newResult[0]!=null){
        to_update=true;
        var ls=await get_all_txns(waddress,chain_name)
        curr_txn_list=curr_txn_list.concat(ls);
        console.log("exists in the table.");
        txns_processed=newResult[4];
        txns_skipped=newResult[5];
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

    if(total_nft_transfers_required==0){
        //await call_server(waddress,chain_name,userid,txn_page,inventory_page,tokenwisemetric_page,true);
        var body= await return_state(waddress,chain_name,txn_page,inventory_page,tokenwisemetric_page);
        return {
            statusCode: 200,
            status: "Success",
            body: body,
        };
    }
    if(total_nft_transfers_required>1000){
        return {
            statusCode : 200,
            status : "Unsupported",
            body: "Sorry, we do not process wallets with more than 1000 txns currently!",
        }
    }
    if(total_nft_transfers_required>25){
        var ret=await call_server(waddress,chain_name,userid,txn_page,inventory_page,tokenwisemetric_page,false);
        return ret;
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

    console.log("For wallet address:",waddress," ,chain: ",chain_name,"total transactions:",all_transfers.length,"\nFollowing are the NFT Transaction values: ");
    let count=0;
    for(let i=0;i<all_transfers.length;i++){
        var txn_row=await transaction_row(all_transfers[i],waddress,chain_name,userid,txns_processed,txns_skipped,count);
        var this_transaction=txn_row[0];
        txns_processed=txn_row[1];
        txns_skipped=txn_row[2];
        count=txn_row[3];
        if(this_transaction!=null) transcations_list.push(this_transaction);
    }

    //update list by also adding existing txns from the table
    if(curr_txn_list.length!=0){
        transcations_list=transcations_list.concat(curr_txn_list);
    }

    await put_txns(waddress,chain_name,transcations_list,txns_processed,txns_skipped);
    const q={chain:chain_name,address: waddress};
    const inventory_NFTS=await Moralis.Web3API.account.getNFTs(q);
    var metrics_;
    if(chain_name=="polygon"){
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result,null,true);
    }
    else{
        metrics_=await get_metrics_token_wise(transcations_list,inventory_NFTS.result);
    }

    var overall_metrics=metrics_[0];
    await put_overall_metrics(waddress,chain_name,overall_metrics);

    var token_wise_metrics=metrics_[1];
    await put_tokenwisemetrics(waddress,chain_name,token_wise_metrics);

    var inventory_things=metrics_[2];
    await put_inventory(waddress,chain_name,inventory_things);

    try{
        var body= await return_state(waddress,chain_name,txn_page,inventory_page,tokenwisemetric_page);
        return {
            statusCode: 200,
            status: "Success",
            body: body,
        };
    }
    catch(e){
        console.log("Error is found....");
        console.log(e);
        return {
            statusCode: 500,
            status: "ERROR",
            body: JSON.stringify({ error: e.message }),
        };
    }
}