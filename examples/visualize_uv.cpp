#include <igl/opengl/glfw/Viewer.h>
#include <igl/read_triangle_mesh.h>
#include <igl/readOBJ.h>
#include <igl/png/writePNG.h>
#include <iostream>
#include "uv_unwrapping.h"

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cout << "用法: " << argv[0] << " <mesh.obj> <uv_method> [output.png]" << std::endl;
        std::cout << "\nuv_method 选项:" << std::endl;
        std::cout << "  lscm  - LSCM 展开" << std::endl;
        std::cout << "  abf   - ABF 展开" << std::endl;
        std::cout << "\n示例: " << argv[0] << " mesh.obj lscm output.png" << std::endl;
        return 1;
    }
    
    std::string mesh_file = argv[1];
    std::string method = argv[2];
    std::string output_file = (argc >= 4) ? argv[3] : "";
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(mesh_file, V, F)) {
        std::cerr << "无法读取网格: " << mesh_file << std::endl;
        return 1;
    }
    
    std::cout << "加载网格: " << V.rows() << " 顶点, " << F.rows() << " 面" << std::endl;
    
    // 执行UV展开
    Eigen::MatrixXd UV;
    std::string method_name;
    
    if (method == "lscm") {
        std::cout << "\n运行 LSCM 展开..." << std::endl;
        auto result = UVUnwrapping::unwrapLSCM(V, F);
        UV = result.UV;
        method_name = "LSCM";
        
        if (UV.rows() > 0) {
            std::cout << "✓ LSCM 成功" << std::endl;
            std::cout << "失真: " << result.distortion << std::endl;
            std::cout << "平均拉伸: " << result.stretch.mean() << std::endl;
        }
    } else if (method == "abf") {
        std::cout << "\n运行 ABF 展开..." << std::endl;
        auto result = UVUnwrapping::unwrapABF(V, F, 100, 1e-4);
        UV = result.UV;
        method_name = "ABF";
        
        if (UV.rows() > 0) {
            std::cout << "✓ ABF 成功" << std::endl;
            std::cout << "失真: " << result.distortion << std::endl;
            std::cout << "平均拉伸: " << result.stretch.mean() << std::endl;
        }
    } else {
        std::cerr << "未知方法: " << method << std::endl;
        std::cerr << "支持的方法: lscm, abf" << std::endl;
        return 1;
    }
    
    if (UV.rows() == 0) {
        std::cerr << "UV 展开失败" << std::endl;
        return 1;
    }
    
    // 创建可视化
    igl::opengl::glfw::Viewer viewer;
    
    // 设置3D模型
    viewer.data().set_mesh(V, F);
    viewer.data().set_uv(UV);
    viewer.data().show_texture = true;
    
    // 创建棋盘格纹理
    const int tex_size = 512;
    Eigen::Matrix<unsigned char, Eigen::Dynamic, Eigen::Dynamic> texture_R(tex_size, tex_size);
    Eigen::Matrix<unsigned char, Eigen::Dynamic, Eigen::Dynamic> texture_G(tex_size, tex_size);
    Eigen::Matrix<unsigned char, Eigen::Dynamic, Eigen::Dynamic> texture_B(tex_size, tex_size);
    
    for (int i = 0; i < tex_size; ++i) {
        for (int j = 0; j < tex_size; ++j) {
            bool checker = ((i / 32) % 2) == ((j / 32) % 2);
            unsigned char val = checker ? 255 : 64;
            texture_R(i, j) = val;
            texture_G(i, j) = val;
            texture_B(i, j) = val;
        }
    }
    
    viewer.data().set_texture(texture_R, texture_G, texture_B);
    
    std::cout << "\n=== 可视化说明 ===" << std::endl;
    std::cout << "窗口显示:" << std::endl;
    std::cout << "  - 3D模型带有UV映射的棋盘格纹理" << std::endl;
    std::cout << "  - 可以旋转、缩放查看展开效果" << std::endl;
    std::cout << "\n快捷键:" << std::endl;
    std::cout << "  - 鼠标拖动: 旋转视角" << std::endl;
    std::cout << "  - 滚轮: 缩放" << std::endl;
    std::cout << "  - Space: 重置视角" << std::endl;
    std::cout << "\n关闭窗口即可退出" << std::endl;
    
    viewer.core().background_color = Eigen::Vector4f(0.3, 0.3, 0.35, 1.0);
    viewer.launch();
    
    return 0;
}
