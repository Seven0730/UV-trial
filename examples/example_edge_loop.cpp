#include <iostream>
#include <fstream>
#include <igl/read_triangle_mesh.h>
#include "uv_segmentation.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj> [output_file]" << std::endl;
        std::cout << "\n示例：按拓扑环（Edge Loop）分割网格" << std::endl;
        std::cout << "适用于：角色脖子、衣服袖口、裤脚、机械部件接合处" << std::endl;
        return 1;
    }
    
    std::string output_file = argc > 2 ? argv[2] : "";
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格文件: " << argv[1] << std::endl;
        return 1;
    }
    
    std::cout << "加载网格: " << V.rows() << " 顶点, " 
              << F.rows() << " 面" << std::endl;
    
    // 检测边环
    std::cout << "\n检测特征边环..." << std::endl;
    double feature_angle = 30.0;  // 30度阈值
    auto edge_loops = UVSegmentation::detectEdgeLoops(V, F, feature_angle);
    
    std::cout << "检测到 " << edge_loops.size() << " 个边环:" << std::endl;
    for (size_t i = 0; i < edge_loops.size(); ++i) {
        std::cout << "  边环 " << i << ": " << edge_loops[i].size() 
                  << " 个顶点" << std::endl;
    }
    
    // 使用边环分割网格
    std::cout << "\n按边环分割网格..." << std::endl;
    auto islands = UVSegmentation::segmentByEdgeLoops(V, F, edge_loops);
    
    std::cout << "生成 " << islands.size() << " 个 UV 岛:" << std::endl;
    for (size_t i = 0; i < islands.size(); ++i) {
        std::cout << "  UV 岛 " << i << ":" << std::endl;
        std::cout << "    面数: " << islands[i].faces.size() << std::endl;
        std::cout << "    面积: " << islands[i].area << std::endl;
        std::cout << "    质心: (" << islands[i].centroid.transpose() << ")" << std::endl;
        std::cout << "    边界边数: " << islands[i].boundary.size() << std::endl;
    }
    
    std::cout << "\n优点：" << std::endl;
    std::cout << "  ✓ UV 形状规整" << std::endl;
    std::cout << "  ✓ 容易 relax 和 pack" << std::endl;
    std::cout << "  ✓ 适合机械部件和规则形状" << std::endl;
    
    // 写入结果文件
    if (!output_file.empty()) {
        std::ofstream out(output_file);
        if (out.is_open()) {
            out << "边缘环分割结果\n";
            out << "================\n\n";
            out << "输入网格: " << argv[1] << "\n";
            out << "顶点数: " << V.rows() << "\n";
            out << "面数: " << F.rows() << "\n\n";
            
            out << "检测参数:\n";
            out << "  特征角度阈值: " << feature_angle << "°\n\n";
            
            out << "检测结果:\n";
            out << "  边环数量: " << edge_loops.size() << "\n";
            for (size_t i = 0; i < edge_loops.size(); ++i) {
                out << "  边环 " << i << ": " << edge_loops[i].size() << " 个顶点\n";
            }
            out << "\n";
            
            out << "分割结果:\n";
            out << "  UV岛数量: " << islands.size() << "\n\n";
            
            for (size_t i = 0; i < islands.size(); ++i) {
                out << "UV岛 " << i << ":\n";
                out << "  面数: " << islands[i].faces.size() << "\n";
                out << "  面积: " << islands[i].area << "\n";
                out << "  质心: (" << islands[i].centroid.transpose() << ")\n";
                out << "  边界边数: " << islands[i].boundary.size() << "\n\n";
            }
            
            out.close();
            std::cout << "\n✓ 结果已保存到: " << output_file << std::endl;
        } else {
            std::cerr << "无法写入文件: " << output_file << std::endl;
        }
    }
    
    return 0;
}
