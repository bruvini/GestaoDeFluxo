import React, { useState, useEffect, useRef } from 'react';
import { differenceInHours, differenceInDays } from 'date-fns';
import {
  Activity, Printer, Upload, RefreshCw, Search,
  MapPin, Clock, Calendar, AlertTriangle, FileText,
  User, Hash, FileSpreadsheet
} from 'lucide-react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { db } from './config/firebase';
import { processExcelUpload } from './services/syncEngine';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

const calculateTimeElapsed = (admissionDate) => {
  const now = new Date();
  const hours = differenceInHours(now, admissionDate);
  const days = differenceInDays(now, admissionDate);

  if (hours < 24) {
    return `${hours} horas`;
  }

  const remainingHours = hours % 24;
  return remainingHours > 0 ? `${days} dia(s) e ${remainingHours} hora(s)` : `${days} dia(s)`;
};

const getStatusColor = (admissionDate) => {
  const days = differenceInDays(new Date(), admissionDate);
  const hours = differenceInHours(new Date(), admissionDate);

  if (hours < 48) return 'border-emerald-500';
  if (hours < 72) return 'border-amber-500';
  if (days < 7) return 'border-orange-500';
  if (days < 15) return 'border-red-500';
  if (days < 30) return 'border-purple-500';
  return 'border-slate-800';
};

function App() {
  const [pacientes, setPacientes] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const fileInputRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'gestaoFluxo_pacientes'),
      where('status', 'in', ['ATIVO', 'SINALIZADA'])
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pacs = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const admissionDate = data.dataInternacao ? new Date(data.dataInternacao) : new Date();
        pacs.push({
          id: doc.id,
          ...data,
          admission: admissionDate,
          statusColor: getStatusColor(admissionDate)
        });
      });
      // Ordena por data de internação (mais antigos primeiro)
      pacs.sort((a, b) => a.admission - b.admission);
      setPacientes(pacs);
    });

    return () => unsubscribe();
  }, []);

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    Swal.fire({
      title: 'Processando Relatório...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        const rows = jsonData.slice(3);

        const dadosTratados = rows
          .filter(row => row[0])
          .map(row => ({
            nome: String(row[0] || ''),
            nascimento: row[1],
            sexo: String(row[2] || ''),
            dataInternacao: row[3],
            setor: String(row[4] || ''),
            leito: String(row[5] || ''),
            especialidade: String(row[6] || '')
          }));

        await processExcelUpload(dadosTratados, db);
        Swal.fire('Sincronizado', 'O censo foi atualizado com sucesso.', 'success');
      } catch (error) {
        console.error(error);
        Swal.fire('Erro', 'Falha na importacao', 'error');
      } finally {
        event.target.value = '';
      }
    };
    reader.onerror = () => {
      Swal.fire('Erro', 'Falha ao ler o arquivo', 'error');
      event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  };

  const groupedPatients = pacientes.reduce((acc, p) => {
    const sector = p.setor || 'NÃO INFORMADO';
    if (!acc[sector]) acc[sector] = [];
    acc[sector].push(p);
    return acc;
  }, {});

  const kpis = { verde: 0, amarelo: 0, laranja: 0, vermelho: 0, roxo: 0, preto: 0 };
  pacientes.forEach(p => {
    const hours = differenceInHours(new Date(), p.admission);
    const days = differenceInDays(new Date(), p.admission);
    if (hours < 48) kpis.verde++;
    else if (hours < 72) kpis.amarelo++;
    else if (days < 7) kpis.laranja++;
    else if (days < 15) kpis.vermelho++;
    else if (days < 30) kpis.roxo++;
    else kpis.preto++;
  });

  const formattedTime = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 pb-12">
      {/* NAVBAR */}
      <header className="bg-[#1e293b] text-white shadow-md flex items-center justify-between px-6 py-3 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <img
            src="/logo-joinville.png"
            alt="Logo Joinville"
            className="h-10 w-auto object-contain bg-white rounded p-1 shadow-sm"
          />
          <h1 className="text-xl font-bold tracking-wide">
            SISTEMA NIR 2.0
          </h1>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 px-3 py-2 rounded text-sm font-medium transition-colors">
              <Printer size={16} /> Imprimir SISREG
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded text-sm font-medium transition-colors shadow-sm"
            >
              <Upload size={16} /> Importar XLSX
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              className="hidden"
              accept=".xlsx, .xls, .csv"
            />
            <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-3 py-2 rounded text-sm font-medium transition-colors">
              <RefreshCw size={16} /> Atualizar
            </button>
          </div>

          <div className="text-right text-slate-300 font-medium whitespace-nowrap border-l border-slate-600 pl-4 ml-2">
            <div className="text-lg leading-tight">{formattedTime}</div>
            <div className="text-xs opacity-75">{formattedDate}</div>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* KPI GRID */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-emerald-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">ATÉ 48 HORAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.verde}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-amber-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">48 A 72 HORAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.amarelo}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-orange-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">72H A 7 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.laranja}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-red-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">7 A 15 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.vermelho}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-purple-500 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">15 A 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.roxo}</div>
          </div>
          <div className="bg-white rounded-lg p-4 shadow-sm border-b-4 border-slate-800 flex flex-col justify-between">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">MAIS DE 30 DIAS</div>
            <div className="text-3xl font-black text-slate-800">{kpis.preto}</div>
          </div>
        </div>

        {/* FILTROS */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end">
            <div className="xl:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Buscar Paciente</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="Nome, Prontuário..."
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50 text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Setor</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50">
                <option value="">Todos os Setores</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
              <select className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-slate-50">
                <option value="">Todos os Status</option>
                <option value="Estável">Estável (&lt; 48h)</option>
                <option value="Atenção">Atenção (48h a 72h)</option>
                <option value="Crítico">Crítico (7 a 15 dias)</option>
              </select>
            </div>

            <div className="flex gap-4 xl:col-span-2 mt-4 xl:mt-0 xl:justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Sem SISREG</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                </div>
                <span className="text-sm font-semibold text-slate-700">Com Notas</span>
              </label>
            </div>
          </div>
        </div>

        {/* LISTA DE PACIENTES */}
        <div className="space-y-6 mt-6">
          {Object.entries(groupedPatients).map(([sector, sectorPatients], idx) => (
            <div key={idx} className="bg-transparent">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-300">
                <MapPin className="text-blue-700" size={20} />
                <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide">
                  {sector}
                </h2>
                <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold ml-2">
                  {sectorPatients.length} PACIENTE(S)
                </span>
              </div>

              <div className="flex flex-col gap-3">
                {sectorPatients.map((p) => (
                  <div
                    key={p.id}
                    className={`bg-white border-y border-r border-slate-200 shadow-sm rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:shadow-md border-l-[16px] ${p.statusColor}`}
                  >
                    <div className="flex-1 w-full">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="bg-slate-800 text-white text-[11px] font-black px-2 py-0.5 rounded shadow-sm">
                          LEITO {p.leito || 'N/A'}
                        </span>
                        <h3 className="font-bold text-slate-800 text-sm uppercase">
                          {p.nome}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Hash size={14} className="text-slate-400" />
                          <span className="font-medium">#{p.id.substring(0, 6)}</span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Calendar size={14} className="text-slate-400" />
                          <span>Nasc: <span className="font-medium">{p.nascimento}</span></span>
                        </div>
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-4">
                          <Clock size={14} className="text-slate-400" />
                          <span>Internação:</span>
                          <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">
                            {calculateTimeElapsed(p.admission)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0 shrink-0 w-full md:w-auto bg-white">
                      {!p.numeroSisreg && (
                        <button className="flex items-center gap-1.5 bg-rose-50 border border-red-200 text-red-600 hover:bg-rose-600 hover:text-white px-3 py-2 rounded-lg font-black text-[10px] shadow-sm animate-pulse transition-colors">
                          <AlertTriangle size={14} /> FALTA SISREG
                        </button>
                      )}

                      {p.historico && p.historico.length > 0 && (
                        <button className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-600 hover:text-white px-4 py-2 rounded-lg font-black text-[10px] shadow-sm transition-colors">
                          <FileText size={14} /> NOTAS ({p.historico.length})
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {pacientes.length === 0 && (
            <div className="text-center p-12 bg-white rounded-lg border border-dashed border-slate-300">
              <Activity className="mx-auto h-12 w-12 text-slate-300" />
              <h3 className="mt-2 text-sm font-semibold text-slate-900">Aguardando atualização de dados</h3>
              <p className="mt-1 text-sm text-slate-500">Banco de dados não possui entradas ativas no momento ou sincronização em andamento.</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}

export default App;
