import React, { useState, useEffect, useRef } from 'react';
import { Bot, Shield, AlertTriangle, CheckCircle, Brain, Server, ArrowRight, Lock, Terminal, Activity, ShieldAlert } from 'lucide-react';
import { Language } from '../types';
import { CONTENT } from '../constants';
import { Button } from './Button';

interface AIDemoProps {
    lang: Language;
}

type AIStatus = 'IDLE' | 'THINKING' | 'QUERYING' | 'ALIGNING' | 'RESPONDING';

export const AIDemo: React.FC<AIDemoProps> = ({ lang }) => {
    const t = CONTENT[lang].ui;
    const [prompt, setPrompt] = useState("");
    const [status, setStatus] = useState<AIStatus>('IDLE');
    const [logs, setLogs] = useState<string[]>([]);
    const [isRisky, setIsRisky] = useState(false);
    const [votesYes, setVotesYes] = useState(30);
    const [votesNo, setVotesNo] = useState(20);
    const [finalOutcome, setFinalOutcome] = useState<'YES' | 'NO' | null>(null);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, msg]);
    };

    const runSimulation = (risky: boolean) => {
        setPrompt(risky ? t.ai_prompt_risky : t.ai_prompt_safe);
        setLogs([]);
        setStatus('THINKING');
        setIsRisky(risky);

        // Set neutral initial state as requested
        setVotesYes(50);
        setVotesNo(50);

        setFinalOutcome(null);

        // Step 1: Thinking & Risk Analysis
        setTimeout(() => {
            if (risky) {
                addLog(t.ai_log_1);
            } else {
                addLog(t.ai_log_safe);
            }

            setStatus('QUERYING');

            // Step 2: Query History Ledger (Retrieval)
            setTimeout(() => {
                addLog(t.ai_log_search_history);

                // Step 3: History Miss & Escalation
                setTimeout(() => {
                    addLog(t.ai_log_history_miss);
                    addLog(t.ai_log_escalate);

                    // Step 4: Deploy Pool
                    setTimeout(() => {
                        addLog(t.ai_log_2);
                        addLog(t.ai_log_3);
                        setStatus('ALIGNING');
                    }, 1000);
                }, 1000);

            }, 1000);
        }, 1000);
    };

    const handleVote = (side: 'YES' | 'NO') => {
        if (side === 'YES') setVotesYes(prev => prev + 20);
        else setVotesNo(prev => prev + 20);

        // Simulate Finalization
        setTimeout(() => {
            const result = side;
            setFinalOutcome(result);
            setStatus('RESPONDING');
            addLog(`> Consensus Finalized: ${result === 'YES' ? 'SAFE' : 'UNSAFE'}`);
        }, 1000);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto min-h-[600px] animate-fade-in">

            {/* Left Panel: Chat Interface */}
            <div className="lg:w-1/2 flex flex-col gap-6">
                <div className="bg-transparent border border-border rounded-2xl p-6 h-full flex flex-col shadow-glow relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-6 border-b border-border pb-4">
                        <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center border border-accent/30">
                            <Bot className="w-6 h-6 text-accent" />
                        </div>
                        <div>
                            <h3 className="font-display font-bold text-text text-lg">Nexus-AI <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded ml-2">v4.0</span></h3>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-text-muted mt-1">
                                <span className={`w-2 h-2 rounded-full ${status === 'IDLE' ? 'bg-success' : 'bg-accent animate-pulse'}`}></span>
                                {status === 'IDLE' ? t.ai_status_idle :
                                    status === 'THINKING' ? t.ai_status_think :
                                        status === 'QUERYING' ? t.ai_status_query :
                                            status === 'ALIGNING' ? t.ai_status_aligning :
                                                t.ai_status_idle}
                            </div>
                        </div>
                    </div>

                    {/* Chat Area */}
                    <div className="flex-1 space-y-4 mb-6 min-h-[300px]">
                        {prompt && (
                            <div className="flex justify-end animate-fade-in">
                                <div className="bg-transparent border border-border rounded-xl rounded-tr-none p-4 max-w-[90%] text-sm font-mono">
                                    {prompt}
                                </div>
                            </div>
                        )}

                        {/* Status Logs */}
                        {logs.length > 0 && (
                            <div className="font-mono text-xs text-accent space-y-1 opacity-80 pl-2 border-l-2 border-accent/20 animate-fade-in">
                                {logs.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        )}

                        {status === 'RESPONDING' && (
                            <div className="flex justify-start animate-fade-in">
                                <div className={`rounded-xl rounded-tl-none p-4 max-w-[90%] text-sm font-mono border ${finalOutcome === 'NO' || (isRisky && finalOutcome === null) ? 'bg-danger/5 border-danger/30 text-danger' : 'bg-success/5 border-success/30 text-success'}`}>
                                    <div className="flex items-start gap-3">
                                        {finalOutcome === 'NO' || (isRisky && finalOutcome === null) ? <ShieldAlert className="w-5 h-5 shrink-0" /> : <CheckCircle className="w-5 h-5 shrink-0" />}
                                        <div>
                                            {finalOutcome === 'NO' ? t.ai_response_unsafe :
                                                (!isRisky && finalOutcome === 'YES') ? t.ai_response_safe :
                                                    (isRisky && finalOutcome === 'YES') ? t.ai_response_safe_risky :
                                                        "..."}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Controls */}
                    <div className="mt-auto grid grid-cols-2 gap-3">
                        <button
                            onClick={() => runSimulation(true)}
                            disabled={status !== 'IDLE' && status !== 'RESPONDING'}
                            className="p-3 border border-danger/30 bg-danger/5 hover:bg-danger/10 text-danger rounded-lg text-xs font-bold font-display uppercase transition-all disabled:opacity-50"
                        >
                            <AlertTriangle className="w-4 h-4 mx-auto mb-2" />
                            Test Risky Prompt
                        </button>
                        <button
                            onClick={() => runSimulation(false)}
                            disabled={status !== 'IDLE' && status !== 'RESPONDING'}
                            className="p-3 border border-success/30 bg-success/5 hover:bg-success/10 text-success rounded-lg text-xs font-bold font-display uppercase transition-all disabled:opacity-50"
                        >
                            <CheckCircle className="w-4 h-4 mx-auto mb-2" />
                            Test Safe Prompt
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: OCP Interface */}
            <div className="lg:w-1/2 flex flex-col justify-center">
                {status === 'IDLE' || status === 'THINKING' ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-text-muted opacity-50 p-12 border-2 border-dashed border-border rounded-2xl">
                        <Server className="w-16 h-16 mb-4" />
                        <p className="font-display font-bold">OCP LINK: STANDBY</p>
                        <p className="font-mono text-xs mt-2">Waiting for Governance Requests...</p>
                    </div>
                ) : (
                    <div className="bg-transparent border border-accent/50 rounded-2xl p-8 shadow-[0_0_30px_rgba(255,122,26,0.1)] relative animate-fade-in backdrop-blur-sm">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-accent rounded flex items-center justify-center animate-pulse">
                                    <Activity className="w-6 h-6 text-black" />
                                </div>
                                <div>
                                    <h4 className="font-display font-bold text-lg text-text">OCP CORE</h4>
                                    <p className="text-xs text-accent font-mono">{t.ai_gov_status}</p>
                                </div>
                            </div>
                            <div className="text-right font-mono text-xs text-text-muted">
                                <div>Prop ID: #{isRisky ? '4092' : '4093'}</div>
                                <div>Block: 18,293,011</div>
                            </div>
                        </div>

                        {/* Proposal */}
                        <div className="bg-transparent border border-border p-4 rounded-lg mb-6 font-mono text-sm text-text-muted">
                            <span className="text-accent font-bold">{'>'} </span> {isRisky ? t.ai_gov_question_risky : t.ai_gov_question_safe}
                        </div>

                        {/* Visualization */}
                        <div className="space-y-4 mb-8">
                            {/* Bar */}
                            <div className="h-4 bg-transparent rounded-full overflow-hidden flex">
                                <div className="bg-success h-full transition-all duration-500" style={{ width: `${(votesYes / (votesYes + votesNo)) * 100}%` }}></div>
                                <div className="bg-danger h-full transition-all duration-500" style={{ width: `${(votesNo / (votesYes + votesNo)) * 100}%` }}></div>
                            </div>
                            <div className="flex justify-between text-xs font-bold font-mono">
                                <span className="text-success">{t.ai_gov_vote_yes}: {votesYes} ETH</span>
                                <span className="text-danger">{t.ai_gov_vote_no}: {votesNo} ETH</span>
                            </div>
                        </div>

                        {/* Controls (You represent the community) */}
                        {status === 'ALIGNING' ? (
                            <div className="grid grid-cols-2 gap-4">
                                <Button variant="success" onClick={() => handleVote('YES')}>
                                    {t.ai_stake_yes_safe}
                                </Button>
                                <Button variant="danger" onClick={() => handleVote('NO')}>
                                    {t.ai_stake_no_unsafe}
                                </Button>
                            </div>
                        ) : (
                            <div className={`text-center p-4 border rounded-lg font-display font-bold animate-fade-in ${finalOutcome === 'YES' ? 'bg-success/10 border-success/20 text-success' : 'bg-danger/10 border-danger/20 text-danger'}`}>
                                {finalOutcome === 'YES' ? t.ai_status_safe : t.ai_status_unsafe}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
