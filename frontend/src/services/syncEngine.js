import { collection, writeBatch, doc, getDocs, query, where } from 'firebase/firestore';

/**
 * Função para gerar UID único e consistente
 * Baseado na lógica legado do Apps Script
 */
const generateId = (nome, dataNascimento) => {
    const rawId = `${nome.trim().toUpperCase()}${String(dataNascimento)}`;
    return btoa(rawId).substring(0, 30); // Limita a 30 caracteres para segurança no Firebase ID
};

/**
 * Motor de Reconciliação do Censo utilizando XLSX e Firestore Batch
 * 
 * @param {Array} pacientesUpload Array de objetos extraídos da planilha XLSX.
 * @param {Object} db Instância do Firestore configurada.
 * @returns {Object} { updated: number, created: number, discharged: number }
 */
export const processExcelUpload = async (pacientesUpload, db) => {
    try {
        const batch = writeBatch(db);
        const pacientesRef = collection(db, 'gestaoFluxo_pacientes');

        // 1. Busca todos os pacientes ATIVOS ou SINALIZADOS no banco
        const activeQuery = query(pacientesRef, where('status', 'in', ['ATIVO', 'SINALIZADA']));
        const querySnapshot = await getDocs(activeQuery);

        const pacientesMap = new Map();
        querySnapshot.forEach((docSnap) => {
            pacientesMap.set(docSnap.id, { ...docSnap.data(), ref: docSnap.ref });
        });

        const currentXlsxUids = new Set();

        let inseridos = 0;
        let atualizados = 0;
        let altas = 0;

        const now = new Date();

        // 2. Itera sobre os dados do XLSX
        pacientesUpload.forEach((p) => {
            const uid = generateId(p.nome, p.nascimento);
            currentXlsxUids.add(uid);
            const docRef = doc(pacientesRef, uid);

            if (pacientesMap.has(uid)) {
                // Paciente existe: Atualiza dados voláteis (Setor, Leito, etc)
                batch.update(docRef, {
                    setor: p.setor,
                    leito: p.leito,
                    especialidade: p.especialidade,
                    status: 'ATIVO',
                    ultimaSinc: now
                });
                atualizados++;
            } else {
                // Paciente novo: Cria
                batch.set(docRef, {
                    nome: p.nome.toUpperCase(),
                    nascimento: p.nascimento,
                    sexo: p.sexo,
                    dataInternacao: p.dataInternacao || now.toISOString(),
                    setor: p.setor,
                    leito: p.leito,
                    especialidade: p.especialidade,
                    status: 'ATIVO',
                    numeroSisreg: '',
                    historico: [],
                    ultimaSinc: now,
                    dataEntrada: now
                });
                inseridos++;
            }
        });

        // 3. Processa altas (Discharged)
        // Se o paciente está no banco como ATIVO mas não veio neste XLSX, ele teve alta/foi transferido.
        pacientesMap.forEach((patientData, uid) => {
            if (!currentXlsxUids.has(uid)) {
                batch.update(patientData.ref, {
                    status: 'ALTA',
                    dataAlta: now,
                    ultimaSinc: now
                });
                altas++;
            }
        });

        // 4. Executa o Commit das operações (WriteBatch)
        await batch.commit();
        return { inseridos, atualizados, altas };

    } catch (error) {
        console.error("Erro no SyncEngine:", error);
        throw error;
    }
};
