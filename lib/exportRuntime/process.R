# Generated model interpreter. A simmer trajectory drives the ordered event
# calendar, with completion/process/arrival priorities matching the browser.
for (.pkg in c("simmer","jsonlite","ggplot2")) if (!requireNamespace(.pkg,quietly=TRUE)) install.packages(.pkg)
library(simmer)
library(jsonlite)
`%or%` <- function(a,b) if (is.null(a)) b else a
run_model <- function(model, config, seed) {
  set.seed(as.integer(seed %% .Machine$integer.max))
  nodes <- setNames(model$nodes, vapply(model$nodes, function(n) n$id, ""))
  cycle_base <- function(p,t){q<-t/p;r<-round(q);(if(abs(q-r)<=.Machine$double.eps*max(1,abs(q))*4)r else floor(q))*p}
  capacity <- function(c,t){
    if(is.null(c$schedule))return(c$capacity %or% 0)
    sc<-c$schedule;base<-cycle_base(sc$period,t)
    for(i in sc$intervals)if(t>=base+i$start&&t<base+i$end)return(i$capacity)
    sc$outsideCapacity
  }
  next_shift <- function(c,t){sc<-c$schedule;p<-sc$period;base<-cycle_base(p,t);bounds<-c(0,p,unlist(lapply(sc$intervals,function(i)c(i$start,i$end))));min(c((base+bounds)[base+bounds>t],base+p+min(bounds[bounds>0])))}
  states <- new.env(parent=emptyenv())
  for (k in names(nodes)) {
    s <- new.env(parent=emptyenv()); c <- nodes[[k]]$config
    s$queue <- list(); for (f in c("areaCapacity","areaUsed","areaOvertime","busy","generated","completed","areaQ","areaBusy","areaStock","maxQ","demand","fulfilled","cost","revenue")) s[[f]] <- 0
    s$capacity<-capacity(c,0);s$stock <- c$initial %or% 0; states[[k]] <- s
  }
  outputs <- list()
  for (e in model$edges) if (e$kind=="entityFlow") outputs[[paste(e$sourceId,e$port %or% "out",sep=":")]] <- list(id=e$targetId,port=e$targetPort %or% "in")
  jobs <- list(); calendar <- list(); time <- 0; sequence <- 0; horizon <- config$horizon; warmup <- config$warmup
  stopifnot(horizon>0, warmup>=0, warmup<horizon)
  sample_dist <- function(d) {
    k <- d$kind
    if (k=="constant") return(d$value)
    if (k=="exponential") return(rexp(1,rate=1/d$mean))
    if (k=="uniform") return(runif(1,d$min,d$max))
    if (k=="discreteUniform") return(d$min+floor(runif(1)*(d$max-d$min+1)))
    if (k=="triangular") {u<-runif(1);a<-d$min;b<-d$max;c<-d$mode;return(if(u<(c-a)/(b-a)) a+sqrt(u*(b-a)*(c-a)) else b-sqrt((1-u)*(b-a)*(b-c)))}
    if (k=="normal") { for(i in seq_len(10000)) {v<-rnorm(1,d$mean,d$stddev);if(d$nonnegativePolicy=="truncate")return(max(0,v));if(v>=0)return(v)};stop("Normal rejection limit") }
    stop("Unsupported distribution")
  }
  value <- function(v,j) {
    switch(v$kind, constant=v$value, quantity=j$quantity, stock=states[[v$nodeId]]$stock,
           available=max(0,states[[v$nodeId]]$capacity-states[[v$nodeId]]$busy),
           attribute={x<-j$attributes[[v$name]];if(is.null(x)||!is.finite(x))stop("Missing numeric attribute");x},
           add=value(v$left,j)+value(v$right,j),multiply=value(v$left,j)*value(v$right,j),
           subtract=value(v$left,j)-value(v$right,j), stop("Unknown value"))
  }
  condition <- function(c,j) {
    a<-value(c$left,j);b<-value(c$right,j)
    switch(c$operator, "<"=a<b,"<="=a<=b,"=="=a==b,">"=a>b,">="=a>=b)
  }
  schedule <- function(kind,node,t,job=NULL,port=NULL) {
    if (!is.finite(t)||t<time) stop("Invalid event time")
    priority<-if(kind=="shift")-1 else if(kind=="end")0 else if(kind=="source")2 else 1
    calendar[[length(calendar)+1]] <<- list(t=t,priority=priority,seq=sequence,kind=kind,node=node,job=job,port=port);sequence<<-sequence+1
  }
  new_job <- function(quantity,attributes=NULL,entity_type="Entity",synthetic=FALSE) {
    if(!is.finite(quantity)||quantity<0)stop("Invalid quantity")
    j<-new.env(parent=emptyenv());j$synthetic<-synthetic;j$retired<-FALSE;j$frames<-numeric();j$attributes<-attributes %or% list();j$entity_type<-entity_type;j$quantity<-quantity;j$arrival<-time;j$wait<-0;j$service<-0;j$started<-time;jobs[[length(jobs)+1]]<<-j;j
  }
  route <- function(k,j,port="out") {dest<-outputs[[paste(k,port,sep=":")]];if(is.null(dest))stop("Missing flow output");schedule("enter",dest$id,time,j,dest$port)}
  finish <- function(j){
    if(j$retired)return(invisible(NULL));j$retired<-TRUE
    if(j$synthetic){for(member in j$members){member$wait<-member$wait+j$wait;member$service<-member$service+j$service;finish(member)}}else j$departure<-time
  }
  priority <- function(k,j){c<-nodes[[k]]$config;if(c$kind=="server"&&identical(c$queueDiscipline,"priority"))j$attributes[[c$priorityAttribute %or% "priority"]] %or% 0 else 0}
  enqueue <- function(k,j,port){s<-states[[k]];s$queue[[length(s$queue)+1]]<-list(job=j,at=time,seq=sequence,port=port);sequence<<-sequence+1
    if(identical(nodes[[k]]$config$queueDiscipline,"priority"))s$queue<-s$queue[order(-vapply(s$queue,function(w)priority(k,w$job),0),vapply(s$queue,function(w)w$seq,0))]
  }
  integrate <- function(t) {
    dt<-max(0,min(t,horizon)-max(time,warmup))
    for(k in names(nodes)){s<-states[[k]];c<-nodes[[k]]$config;pool<-if(c$kind=="server"&&!is.null(c$resourceId))states[[c$resourceId]]else s
      s$areaCapacity<-s$areaCapacity+pool$capacity*dt;s$areaUsed<-s$areaUsed+s$busy*(if(pool$busy>pool$capacity&&pool$busy>0)pool$capacity/pool$busy else 1)*dt;s$areaOvertime<-s$areaOvertime+max(0,s$busy-pool$capacity)*dt
      s$areaQ<-s$areaQ+length(s$queue)*dt;s$areaBusy<-s$areaBusy+s$busy*dt;s$areaStock<-s$areaStock+s$stock*dt}
    time<<-t
  }
  pump <- function() {
    changed<-FALSE;blocked<-character()
    heads<-names(nodes)[vapply(names(nodes),function(k)length(states[[k]]$queue)>0,TRUE)]
    if(length(heads)) heads<-heads[order(-vapply(heads,function(k)priority(k,states[[k]]$queue[[1]]$job),0),vapply(heads,function(k)states[[k]]$queue[[1]]$seq,0))]
    for(k in heads){c<-nodes[[k]]$config;s<-states[[k]];w<-s$queue[[1]];j<-w$job
      if(c$kind=="batch"){
        chosen<-NULL
        for(first in s$queue){group<-Filter(function(x)is.null(c$matchAttribute)||identical(x$job$attributes[[c$matchAttribute]],first$job$attributes[[c$matchAttribute]]),s$queue);if(length(group)>=c$size){chosen<-group[seq_len(c$size)];break}}
        if(is.null(chosen))next
        ids<-vapply(chosen,function(x)x$seq,0);s$queue<-Filter(function(x)!x$seq %in% ids,s$queue)
        for(x in chosen)x$job$wait<-x$job$wait+time-x$at
        carrier<-new_job(sum(vapply(chosen,function(x)x$job$quantity,0)),chosen[[1]]$job$attributes,"Batch",TRUE);carrier$members<-lapply(chosen,function(x)x$job)
        s$completed<-s$completed+1;route(k,carrier);return(TRUE)
      }
      if(c$kind=="join"){
        pair<-NULL
        for(a in s$queue){for(b in s$queue){if(a$port!=b$port&&identical(tail(a$job$frames,1),tail(b$job$frames,1))){pair<-list(a,b);break}};if(!is.null(pair))break}
        if(is.null(pair))next
        a<-pair[[if(pair[[1]]$port=="a")1 else 2]];b<-pair[[if(pair[[1]]$port=="b")1 else 2]]
        s$queue<-Filter(function(x)!x$seq %in% c(a$seq,b$seq),s$queue);a$job$wait<-a$job$wait+time-a$at;b$job$wait<-b$job$wait+time-b$at
        finish(b$job);a$job$frames<-head(a$job$frames,-1);s$completed<-s$completed+1;route(k,a$job);return(TRUE)
      }
      if(c$kind=="server"){
        key<-c$resourceId %or% k;pool<-states[[key]];capacity<-pool$capacity
        if(key %in% blocked||pool$busy>=capacity){blocked<-c(blocked,key);next}
        s$queue<-s$queue[-1];s$busy<-s$busy+1;if(!identical(pool,s))pool$busy<-pool$busy+1
        j$wait<-j$wait+time-w$at;j$started<-time;schedule("end",k,time+sample_dist(c$serviceDistribution),j);return(TRUE)
      } else if(c$kind=="stock"){
        store<-states[[c$storeId]];amount<-value(c$amount,j)
        if(!is.finite(amount)||amount<0)stop("Invalid stock amount")
        if(c$operation=="take"&&(c$storeId %in% blocked||store$stock<amount)){blocked<-c(blocked,c$storeId);next}
        s$queue<-s$queue[-1];j$wait<-j$wait+time-w$at
        actual<-if(c$operation=="fulfill")min(store$stock,amount)else amount
        store$stock<-store$stock+if(c$operation=="put")actual else -actual
        if(time>=warmup&&time<=horizon){s$demand<-s$demand+amount;s$fulfilled<-s$fulfilled+actual;s$cost<-s$cost+actual*c$unitCost;s$revenue<-s$revenue+actual*c$unitRevenue}
        s$completed<-s$completed+1;route(k,j);return(TRUE)
      }
    };changed
  }
  for(k in names(nodes)){c<-nodes[[k]]$config
    if(c$kind=="source"){t<-(c$startTime %or% 0)+sample_dist(c$interarrivalDistribution);if(t<horizon&&t<=(c$endTime %or% Inf)&&(c$arrivalLimit %or% Inf)>0)schedule("source",k,t)}
    else if(c$kind=="population")schedule("initial",k,0)
    else if(c$kind=="resource"&&!is.null(c$schedule))schedule("shift",k,next_shift(c,0))
  }
  steps<-0;next_event<-NULL
  prepare <- function() {
    repeat {
    if(!length(calendar))return(FALSE)
    pos<-order(vapply(calendar,function(e)e$t,0),vapply(calendar,function(e)e$priority,0),vapply(calendar,function(e)e$seq,0))[1]
    next_event<<-calendar[[pos]];calendar<<-calendar[-pos]
    if(identical(config$stopMode,"horizon")&&next_event$t>=horizon)return(FALSE)
    if(!identical(config$stopMode,"horizon")&&next_event$kind=="shift"&&next_event$t>=horizon&&!any(vapply(calendar,function(e)e$kind!="shift",TRUE))&&!any(vapply(names(nodes),function(k)nodes[[k]]$config$kind=="server"&&!is.null(nodes[[k]]$config$resourceId)&&length(states[[k]]$queue)>0,TRUE)))next
    steps<<-steps+1;if(steps>config$maxEvents)stop("Event limit reached; check cycles")
    return(TRUE)
    }
  }
  execute <- function() {
    e<-next_event;integrate(e$t);k<-e$node;c<-nodes[[k]]$config;s<-states[[k]];j<-e$job
    if(e$kind=="shift"){
      s$capacity<-capacity(c,time)
      if(time<horizon||any(vapply(calendar,function(e)e$kind!="shift",TRUE))||any(vapply(names(nodes),function(x)nodes[[x]]$config$kind=="server"&&identical(nodes[[x]]$config$resourceId,k)&&length(states[[x]]$queue)>0,TRUE)))schedule("shift",k,next_shift(c,time))
    } else if(e$kind=="initial"){
      for(i in seq_len(c$count)){s$generated<-s$generated+1;route(k,new_job(c$quantity,c$attributes,c$entityType %or% "Entity"))}
    } else if(e$kind=="source"){
      nxt<-time+sample_dist(c$interarrivalDistribution)
      if(nxt<horizon&&nxt<=(c$endTime %or% Inf)&&s$generated+1<(c$arrivalLimit %or% Inf))schedule("source",k,nxt)
      j<-new_job(if(is.null(c$quantityDistribution))1 else sample_dist(c$quantityDistribution),c$attributes,c$entityType %or% "Entity");s$generated<-s$generated+1;route(k,j)
    } else if(e$kind=="end"){
      s$busy<-s$busy-1;s$completed<-s$completed+1;j$service<-j$service+time-j$started
      if(c$kind=="server"&&!is.null(c$resourceId))states[[c$resourceId]]$busy<-states[[c$resourceId]]$busy-1
      route(k,j)
    } else if(c$kind %in% c("server","stock","batch","join")){
      if(c$kind=="batch"&&!is.null(c$matchAttribute)&&is.null(j$attributes[[c$matchAttribute]]))stop("Missing batch match attribute")
      if(c$kind=="join"){
        if(!length(j$frames)||!e$port %in% c("a","b"))stop("Join requires related Signal branches")
        if(any(vapply(s$queue,function(w)identical(w$port,e$port)&&identical(tail(w$job$frames,1),tail(j$frames,1)),TRUE)))stop("Duplicate Join branch")
      }
      enqueue(k,j,e$port)
    } else if(c$kind=="unbatch"){
      if(is.null(j$members))stop("Unbatch requires a batch")
      for(member in j$members){member$wait<-member$wait+j$wait;member$service<-member$service+j$service;route(k,member)}
      j$retired<-TRUE;s$completed<-s$completed+1
    } else if(c$kind=="assign"){
      for(a in c$assignments){v<-value(a$value,j);if(!is.finite(v))stop("Invalid attribute value");j$attributes[[a$name]]<-v};route(k,j)
    } else if(c$kind=="router"){
      s$completed<-s$completed+1;route(k,j,if(runif(1)<c$probability)"true" else "false")
    } else if(c$kind=="delay"){
      s$busy<-s$busy+1;j$started<-time;schedule("end",k,time+sample_dist(c$distribution),j)
    } else if(c$kind=="sink"){
      finish(j);s$completed<-s$completed+1
    } else if(c$kind=="decision"){
      s$completed<-s$completed+1;route(k,j,if(all(vapply(c$conditions,function(x)condition(x,j),TRUE)))"true" else "false")
    } else if(c$kind=="signal"){
      child<-new_job(value(c$quantity,j),j$attributes,j$entity_type);correlation<-sequence;sequence<<-sequence+1;child$frames<-c(j$frames,correlation);j$frames<-c(j$frames,correlation);s$generated<-s$generated+1;route(k,child,"spawn");route(k,j)
    } else stop("Entity entered invalid block")
    while(pump()){}
    for(k in names(nodes)){s<-states[[k]];s$maxQ<-max(s$maxQ,length(s$queue))}
    0
  }
  # One simmer trajectory advances to the next ordered model event. A fresh
  # driver is activated after each step so zero-delay events preserve priority.
  env<-simmer("DES process model")
  driver<-trajectory("calendar") %>% timeout(function() next_event$t-now(env)) %>% timeout(function(){execute();0})
  while(prepare()){
    prefix<-paste0("event",steps,"_")
    add_generator(env,prefix,driver,at(0),mon=0)
    run(env)
  }
  if(time<horizon)integrate(horizon)
  duration<-horizon-warmup;result<-list();cost<-0;revenue<-0
  for(k in names(nodes)){c<-nodes[[k]]$config;s<-states[[k]];kind<-c$kind
    period<-c$costPeriod %or% 1;periods<-max(0,ceiling(horizon/period)-floor(warmup/period))
    if(kind=="store"){
      result[[paste0(k,":stock")]]<-s$stock;result[[paste0(k,":average")]]<-s$areaStock/duration
      x<-s$areaStock*c$holdingCost+c$initial*c$fixedCost*periods;cost<-cost+x;result[[paste0(k,":cost")]]<-x
    }
    if(kind=="resource"){
      result[[paste0(k,":utilization")]]<-if(s$areaCapacity>0)100*s$areaUsed/s$areaCapacity else 0
      if(!is.null(c$schedule)){result[[paste0(k,":staffed")]]<-s$areaCapacity;result[[paste0(k,":overtime")]]<-s$areaOvertime}
      x<-if(!is.null(c$schedule))s$areaCapacity*c$costPerUnit/c$costPeriod else c$capacity*c$costPerUnit*periods;cost<-cost+x;result[[paste0(k,":cost")]]<-x
    }
    if(kind %in% c("server","stock","batch","join")){result[[paste0(k,":queue")]]<-s$areaQ/duration;result[[paste0(k,":waiting")]]<-s$areaQ}
    if(kind=="server")result[[paste0(k,":utilization")]]<-if(s$areaCapacity>0)100*s$areaUsed/s$areaCapacity else 0
    if(kind %in% c("batch","unbatch","join"))result[[paste0(k,":completed")]]<-s$completed
    if(kind=="delay"){result[[paste0(k,":active")]]<-s$areaBusy/duration;if(!is.null(c$populationId))result[[paste0(k,":availability")]]<-100*s$areaBusy/duration/nodes[[c$populationId]]$config$count}
    if(kind=="signal")result[[paste0(k,":count")]]<-s$generated
    if(kind=="stock"){
      x<-s$cost+s$areaQ*c$waitingCost;cost<-cost+x;revenue<-revenue+s$revenue;result[[paste0(k,":units")]]<-s$fulfilled;result[[paste0(k,":cost")]]<-x
      if(c$operation=="fulfill"){
        result[[paste0(k,":fill")]]<-if(s$demand>0)100*s$fulfilled/s$demand else 100
        result[[paste0(k,":lost")]]<-s$demand-s$fulfilled
      }
    }
  }
  result$cost<-cost;result$revenue<-revenue;result$balance<-revenue-cost
  if(TRUE){
    servers<-names(nodes)[vapply(nodes,function(n)n$config$kind=="server",TRUE)]
    done<-Filter(function(j)!j$synthetic&&!is.null(j$departure)&&j$arrival>=warmup,jobs)
    total_capacity<-sum(vapply(servers,function(k)nodes[[nodes[[k]]$config$resourceId %or% k]]$config$capacity,0));if(total_capacity==0)total_capacity<-1
    count<-length(done);denom<-max(1,count)
    result$totalArrivals<-sum(vapply(jobs,function(j)!j$synthetic&&j$arrival>=warmup,TRUE));result$totalDepartures<-count
    result$avgWaitTime<-sum(vapply(done,function(j)j$wait,0))/denom
    result$avgServiceTime<-sum(vapply(done,function(j)j$service,0))/denom
    result$avgSojournTime<-sum(vapply(done,function(j)j$departure-j$arrival,0))/denom
    result$avgQueueLength<-sum(vapply(servers,function(k)states[[k]]$areaQ,0))/duration
    result$avgUtilization<-sum(vapply(servers,function(k)states[[k]]$areaUsed,0))/max(.Machine$double.eps,sum(vapply(unique(vapply(servers,function(k)nodes[[k]]$config$resourceId %or% k,"")),function(k)states[[k]]$areaCapacity,0)))
    result$maxQueueLength<-max(c(0,vapply(servers,function(k)states[[k]]$maxQ,0)));result$throughput<-count/duration
  };result
}
reps<-lapply(seq_len(CONFIG$replications),function(i)run_model(MODEL,CONFIG,(CONFIG$seed+(i-1)*1000)%%4294967296))
dfs<-c(1,2,3,4,5,6,7,8,9,10,12,15,20,25,30)
ts<-c(12.706,4.303,3.182,2.776,2.571,2.447,2.365,2.306,2.262,2.228,2.179,2.131,2.086,2.060,2.042)
n<-length(reps);idx<-which(n-1<=dfs);critical<-if(length(idx))ts[idx[1]]else 1.96
summary<-setNames(lapply(names(reps[[1]]),function(k){v<-vapply(reps,function(r)r[[k]],0);m<-mean(v);s<-if(n>1)sd(v)else 0;half<-critical*s/sqrt(n);list(mean=m,std=s,lower=m-half,upper=m+half,n=n)}),names(reps[[1]]))
cat(toJSON(list(unit=MODEL$unit,replications=reps,summary=summary),auto_unbox=TRUE,digits=15),"\n")
# ── Visualisation (ggplot2) ──────────────────────────────────────────────────
tryCatch({
  library(ggplot2)
  safe_mean<-function(key){x<-summary[[key]];if(is.null(x))0 else x$mean}
  util_rows<-do.call(rbind,Filter(Negate(is.null),lapply(MODEL$nodes,function(n){
    if(!n$config$kind %in% c("server","resource"))return(NULL)
    key<-paste0(n$id,":utilization");if(is.null(summary[[key]]))return(NULL)
    data.frame(name=n$name,utilisation=summary[[key]]$mean,stringsAsFactors=FALSE)
  })))
  base_name<-gsub(" ","_",MODEL$name)
  if(!is.null(util_rows)&&nrow(util_rows)>0){
    p1<-ggplot(util_rows,aes(x=utilisation,y=reorder(name,utilisation)))+
      geom_col(fill="#4f8ef7")+
      geom_vline(xintercept=80,colour="#f59e0b",linetype="dashed",linewidth=0.8)+
      geom_text(aes(label=sprintf("%.1f%%",utilisation)),hjust=-0.15,size=3.2)+
      xlim(0,112)+labs(title="Resource Utilisation",x="Utilisation (%)",y=NULL)+
      theme_minimal(base_size=11)
    print(p1)
    ggsave(paste0(base_name,"_utilisation.png"),p1,width=8,height=max(3,nrow(util_rows)*0.6+1.5),dpi=150)
  }
  times_df<-data.frame(metric=c("Avg wait","Avg service"),
    value=c(safe_mean("avgWaitTime"),safe_mean("avgServiceTime")),stringsAsFactors=FALSE)
  p2<-ggplot(times_df,aes(x=metric,y=value,fill=metric))+
    geom_col(show.legend=FALSE)+
    scale_fill_manual(values=c("#4c8cbf","#e07b54"))+
    geom_text(aes(label=sprintf("%.2f",value)),vjust=-0.4,size=3.5)+
    labs(title="Entity Times",x=NULL,y=paste0("Time (",MODEL$unit,"s)"))+
    theme_minimal(base_size=11)
  print(p2)
  ggsave(paste0(base_name,"_times.png"),p2,width=5,height=4,dpi=150)
  cat("Charts saved.\n")
},error=function(e)cat("ggplot2 error:",conditionMessage(e),"\n"))
